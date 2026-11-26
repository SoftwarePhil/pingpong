import { NextRequest, NextResponse } from 'next/server';
import { MARKER_PLAYER_ID } from '../../../../types/pingpong';
import { getMatch, getTournament, mutateTournament, placeMatch, removeMatchFromTournament, removeGamesFromHistory, recalculateMatchWinner } from '../../../../data/data';
import { cascadeRoundRobinPlayerSwap, cascadeBracketPlayerSwap } from '../../../../lib/tournament';
import { requireAdmin } from '../../../../lib/auth';
import { isDoublesMatch } from '../../../../lib/matchFormat';
import { reject, tournamentErrorResponse } from '../../../../lib/tournamentErrors';

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
  const { admin, denied } = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id: matchId } = await params;
    const parsed = parseMatchUpdate(await request.json().catch(() => null));
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { update } = parsed;

    const currentMatch = await getMatch(matchId);
    const owningTournament = currentMatch && await getTournament(currentMatch.tournamentId);
    if (!currentMatch || owningTournament?.clubId !== admin.clubId) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const { result } = await mutateTournament(currentMatch.tournamentId, tournament => {
      const matches = tournament.matches ?? [];
      const match = matches.find(m => m.id === matchId) ?? reject('Match not found', 404);

      // Changing the number of games may change (or clear) the winner based on
      // the games already recorded, so recompute it. A bracket match also
      // carries a changed winner forward into the next round.
      if (update.bestOf !== undefined) {
        return placeMatch(tournament, recalculateMatchWinner({ ...match, bestOf: update.bestOf }));
      }

      // Player reassignment — cascade changes to other matches in the same round
      const isRR = match.round === 'roundRobin';
      const isBracket = match.round === 'bracket';

      if (!isRR && !isBracket) {
        reject('Players can only be changed in round robin or bracket matches');
      }
      if (isRR && isDoublesMatch(match)) {
        reject('Doubles teams cannot be changed after the round is generated');
      }
      if (match.games.length > 0) {
        reject('Cannot change players after games have been played');
      }

      const newP1 = update.player1Id ?? match.player1Id;
      const newP2 = update.player2Id ?? match.player2Id;

      if (newP1 === newP2) {
        reject('Player 1 and Player 2 must be different');
      }

      if (newP1 === MARKER_PLAYER_ID || (newP2 === MARKER_PLAYER_ID &&
          (match.round !== 'roundRobin' || match.player2Id !== 'BYE' || match.winnerId !== match.player1Id))) {
        reject('A marker can only be added to an unplayed round-robin bye');
      }

      // Incoming players must be active in this tournament. The match's current
      // slots stay valid, and a bracket may move its BYE or a round-robin bye
      // may gain a marker (checked above).
      const allowedIds = new Set([
        ...(tournament.activePlayers ?? tournament.players),
        match.player1Id,
        match.player2Id,
        isRR ? MARKER_PLAYER_ID : 'BYE',
      ]);
      const unknownPlayers = [newP1, newP2].filter(id => !allowedIds.has(id));
      if (unknownPlayers.length > 0) {
        reject(`Not an active player in this tournament: ${unknownPlayers.join(', ')}`);
      }

      const bracketStarted = Boolean(
        tournament.bracketStartedAt ||
        matches.some(m => m.round === 'bracket') ||
        tournament.status === 'bracket'
      );
      if (isRR && bracketStarted) {
        reject('Cannot edit round robin matches after bracket has started');
      }

      if (isRR) {
        tournament.matches = cascadeRoundRobinPlayerSwap(matches, matchId, newP1, newP2);
        if (newP2 === MARKER_PLAYER_ID) {
          tournament.matches = tournament.matches.map(m => m.id === matchId ? { ...m, winnerId: undefined } : m);
        }
      } else {
        const hasLinkedThirdPlace = matches.some(m =>
          m.round === 'bracket' &&
          m.isThirdPlace &&
          m.bracketRound === match.bracketRound
        );
        if (match.isThirdPlace || hasLinkedThirdPlace) {
          reject('Final and third-place participants are fixed after the semifinals');
        }
        tournament.matches = cascadeBracketPlayerSwap(matches, matchId, newP1, newP2);
      }

      return { match: tournament.matches.find(m => m.id === matchId)!, invalidatedGameIds: [] as string[] };
    });

    await removeGamesFromHistory(result.invalidatedGameIds);
    return NextResponse.json(result.match);
  } catch (error) {
    const handled = tournamentErrorResponse(error);
    if (handled) return handled;
    console.error('Error updating match:', error);
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { admin, denied } = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id: matchId } = await params;

    const match = await getMatch(matchId);
    const tournament = match && await getTournament(match.tournamentId);
    if (tournament?.clubId !== admin.clubId) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const result = await removeMatchFromTournament(matchId);
    if (!result) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Match and associated games deleted successfully',
      deletedMatch: result.match,
    });
  } catch (error) {
    const handled = tournamentErrorResponse(error);
    if (handled) return handled;
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
