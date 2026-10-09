import { NextRequest, NextResponse } from 'next/server';
import { Match, MARKER_PLAYER_ID } from '../../../../types/pingpong';
import { getMatch, getTournamentIdForMatch, getTournament, setTournament, updateMatchInTournament, removeMatchFromTournament, removeGamesFromHistory, recalculateMatchWinner, saveData } from '../../../../data/data';
import { cascadeRoundRobinPlayerSwap, cascadeBracketPlayerSwap, cascadeBracketOutcomeChange } from '../../../../lib/tournament';
import { requireAdmin } from '../../../../lib/auth';
import { isDoublesMatch } from '../../../../lib/matchFormat';

const EDITABLE_FIELDS = ['player1Id', 'player2Id', 'bestOf'] as const;

type MatchUpdate = { player1Id?: string; player2Id?: string; bestOf?: number };

/** Accepts only the fields an admin may change, with the right types. */
function parseMatchUpdate(body: unknown): { update: MatchUpdate } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid match update' };
  }
  const input = body as Record<string, unknown>;
  const unknownFields = Object.keys(input).filter(key => !(EDITABLE_FIELDS as readonly string[]).includes(key));
  if (unknownFields.length > 0) {
    return { error: `These match fields cannot be changed: ${unknownFields.join(', ')}` };
  }
  const { player1Id, player2Id, bestOf } = input;
  if ([player1Id, player2Id].some(id => id !== undefined && (typeof id !== 'string' || id === ''))) {
    return { error: 'Player ids must be non-empty strings' };
  }
  if (bestOf !== undefined && !(typeof bestOf === 'number' && Number.isInteger(bestOf) && bestOf >= 1 && bestOf % 2 === 1)) {
    return { error: 'Best of must be an odd whole number' };
  }
  const changesPlayers = player1Id !== undefined || player2Id !== undefined;
  if (changesPlayers === (bestOf !== undefined)) {
    return { error: 'Change either the players or the number of games' };
  }
  return { update: { player1Id, player2Id, bestOf } as MatchUpdate };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id: matchId } = await params;
    const parsed = parseMatchUpdate(await request.json().catch(() => null));
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { update } = parsed;

    const currentMatch = await getMatch(matchId);
    if (!currentMatch) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Player reassignment — cascade changes to other matches in the same round
    if (update.bestOf === undefined) {
      const isRR = currentMatch.round === 'roundRobin';
      const isBracket = currentMatch.round === 'bracket';

      if (!isRR && !isBracket) {
        return NextResponse.json({ error: 'Players can only be changed in round robin or bracket matches' }, { status: 400 });
      }
      if (isRR && isDoublesMatch(currentMatch)) {
        return NextResponse.json({ error: 'Doubles teams cannot be changed after the round is generated' }, { status: 400 });
      }
      if (currentMatch.games.length > 0) {
        return NextResponse.json({ error: 'Cannot change players after games have been played' }, { status: 400 });
      }

      const newP1 = update.player1Id ?? currentMatch.player1Id;
      const newP2 = update.player2Id ?? currentMatch.player2Id;

      if (newP1 === newP2) {
        return NextResponse.json({ error: 'Player 1 and Player 2 must be different' }, { status: 400 });
      }

      if (newP1 === MARKER_PLAYER_ID || (newP2 === MARKER_PLAYER_ID &&
          (currentMatch.round !== 'roundRobin' || currentMatch.player2Id !== 'BYE' || currentMatch.winnerId !== currentMatch.player1Id))) {
        return NextResponse.json({ error: 'A marker can only be added to an unplayed round-robin bye' }, { status: 400 });
      }

      // Load the tournament and cascade all changes in memory, then save once
      const tournamentId = await getTournamentIdForMatch(matchId);
      if (!tournamentId) {
        return NextResponse.json({ error: 'Tournament not found for match' }, { status: 404 });
      }
      const tournament = await getTournament(tournamentId);
      if (!tournament?.matches) {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }

      // Incoming players must be active in this tournament. The match's current
      // slots stay valid, and a bracket may move its BYE or a round-robin bye
      // may gain a marker (checked above).
      const allowedIds = new Set([
        ...(tournament.activePlayers ?? tournament.players),
        currentMatch.player1Id,
        currentMatch.player2Id,
        isRR ? MARKER_PLAYER_ID : 'BYE',
      ]);
      const unknownPlayers = [newP1, newP2].filter(id => !allowedIds.has(id));
      if (unknownPlayers.length > 0) {
        return NextResponse.json(
          { error: `Not an active player in this tournament: ${unknownPlayers.join(', ')}` },
          { status: 400 },
        );
      }

      const bracketStarted = Boolean(
        tournament.bracketStartedAt ||
        (tournament.matches ?? []).some(m => m.round === 'bracket') ||
        tournament.status === 'bracket'
      );
      if (isRR && bracketStarted) {
        return NextResponse.json(
          { error: 'Cannot edit round robin matches after bracket has started' },
          { status: 400 }
        );
      }

      if (isRR) {
        tournament.matches = cascadeRoundRobinPlayerSwap(tournament.matches, matchId, newP1, newP2);
        if (newP2 === MARKER_PLAYER_ID) {
          tournament.matches = tournament.matches.map(m => m.id === matchId ? { ...m, winnerId: undefined } : m);
        }
      } else {
        const hasLinkedThirdPlace = tournament.matches.some(m =>
          m.round === 'bracket' &&
          m.isThirdPlace &&
          m.bracketRound === currentMatch.bracketRound
        );
        if (currentMatch.isThirdPlace || hasLinkedThirdPlace) {
          return NextResponse.json(
            { error: 'Final and third-place participants are fixed after the semifinals' },
            { status: 400 }
          );
        }
        tournament.matches = cascadeBracketPlayerSwap(tournament.matches, matchId, newP1, newP2);
      }

      await setTournament(tournament);
      await saveData();

      const updatedMatch = tournament.matches.find(m => m.id === matchId)!;
      return NextResponse.json(updatedMatch);
    }

    // Changing the number of games may change (or clear) the winner based on
    // the games already recorded, so recompute it.
    const updatedMatch: Match = recalculateMatchWinner({ ...currentMatch, bestOf: update.bestOf });

    if (updatedMatch.round === 'bracket') {
      // Bracket matches may need to propagate a changed outcome forward to
      // an already-created next-round match, so this goes through the full
      // tournament document rather than the single-match helper.
      const tournamentId = await getTournamentIdForMatch(matchId);
      if (!tournamentId) {
        return NextResponse.json({ error: 'Tournament not found for match' }, { status: 404 });
      }
      const tournament = await getTournament(tournamentId);
      if (!tournament?.matches) {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }
      const idx = tournament.matches.findIndex(m => m.id === matchId);
      if (idx === -1) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }
      tournament.matches[idx] = updatedMatch;
      const { matches, invalidatedGameIds } = cascadeBracketOutcomeChange(tournament.matches, matchId);
      tournament.matches = matches;
      await setTournament(tournament);
      if (invalidatedGameIds.length > 0) {
        await removeGamesFromHistory(invalidatedGameIds);
      }
      return NextResponse.json(tournament.matches.find(m => m.id === matchId)!);
    }

    const tournament = await updateMatchInTournament(updatedMatch);
    if (!tournament) {
      return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
    }

    return NextResponse.json(updatedMatch);
  } catch (error) {
    console.error('Error updating match:', error);
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id: matchId } = await params;

    const result = await removeMatchFromTournament(matchId);
    if (!result) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Match and associated games deleted successfully',
      deletedMatch: result.match,
    });
  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
