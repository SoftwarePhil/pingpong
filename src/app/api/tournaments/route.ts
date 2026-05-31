import { NextRequest, NextResponse } from 'next/server';
import { Tournament } from '../../../types/pingpong';
import { getTournaments, saveData, setTournament, getTournament, deleteTournament, registerMatchesIndex, unregisterMatchesIndex, syncTournamentPlayers } from '../../../data/data';
import { createRoundRobinPairings, advanceBracketRound, createBracketMatches, advanceRoundRobinRound } from '../../../lib/tournament';

export async function GET() {
  try {
    const tournaments = await getTournaments();
    return NextResponse.json(tournaments);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to read tournaments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, roundRobinRounds, bracketRounds, players, rrBestOf, rrPairingStrategy }: { name: string; roundRobinRounds: number; bracketRounds: { matchCount: number; bestOf: number }[]; players: string[]; rrBestOf: number; rrPairingStrategy?: 'random' | 'top-vs-top' } = body;
    const uniquePlayers = [...new Set(players)];
    if (!name || !roundRobinRounds || !bracketRounds || !uniquePlayers || uniquePlayers.length < 2) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    // Prevent creating a tournament if one is already active
    const existingTournaments = await getTournaments();
    const activeTournament = existingTournaments.find(t => t.status !== 'completed');
    if (activeTournament) {
      return NextResponse.json({ error: `There is already an active tournament: "${activeTournament.name}". Complete or end it before creating a new one.` }, { status: 409 });
    }
    const newTournament: Tournament = {
      id: Date.now().toString(),
      name,
      startDate: new Date().toISOString(),
      status: 'roundRobin',
      roundRobinRounds,
      rrBestOf: rrBestOf ?? 1,
      rrPairingStrategy: rrPairingStrategy ?? 'random',
      bracketRounds,
      players: uniquePlayers,
      matches: [], // Will be populated with embedded matches
    };

    // Create first round robin pairings
    const shuffledPlayers = [...uniquePlayers].sort(() => Math.random() - 0.5);
    const embeddedMatches = createRoundRobinPairings(shuffledPlayers, newTournament.id, 1, newTournament.rrBestOf);

    // Embed matches in tournament document
    newTournament.matches = embeddedMatches;

    // Save tournament, sync player records, and register matches in the index
    await setTournament(newTournament);
    await syncTournamentPlayers(newTournament);
    await registerMatchesIndex(embeddedMatches);
    await saveData();

    return NextResponse.json(newTournament, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create tournament' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, action, activePlayers, players }: {
      id: string;
      status?: 'roundRobin' | 'bracket' | 'completed';
      action?: 'advanceRound' | 'addRoundRobinRound' | 'startBracket';
      activePlayers?: string[];
      players?: string[];
    } = body;

    const tournament = await getTournament(id);

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const bracketMatches = (tournament.matches ?? []).filter(m => m.round === 'bracket');
    const bracketStarted = Boolean(tournament.bracketStartedAt || bracketMatches.length > 0 || tournament.status === 'bracket');

if (action === 'advanceRound') {
      if (!bracketStarted && tournament.status !== 'completed') {
        // Check if all current round matches are completed
        const currentRoundMatches = (tournament.matches ?? []).filter(m =>
          m.round === 'roundRobin' &&
          !m.winnerId
        );

        if (currentRoundMatches.length > 0) {
          return NextResponse.json({ error: 'Current round is not complete' }, { status: 400 });
        }

        // Advance to next round
        const newMatches = advanceRoundRobinRound(tournament);

        if (newMatches.length === 0) {
          return NextResponse.json(
            { error: 'No more round robin rounds. Add another round or start bracket.' },
            { status: 400 }
          );
        }

        if (!tournament.matches) tournament.matches = [];
        tournament.matches.push(...newMatches);
        await registerMatchesIndex(newMatches);

        await setTournament(tournament);
        await saveData();
      } else if (bracketStarted && tournament.status !== 'completed') {
        // Advance bracket round
        const newBracketMatches = advanceBracketRound(tournament);
        if (newBracketMatches.length === 0 && (tournament.status as string) !== 'completed') {
          return NextResponse.json({ error: 'Cannot advance bracket round' }, { status: 400 });
        }

        if (newBracketMatches.length > 0) {
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...newBracketMatches);
          await registerMatchesIndex(newBracketMatches);
        }

        await setTournament(tournament);
        await saveData();
      }
    }

    if (action === 'startBracket') {
      if (tournament.status === 'completed') {
        return NextResponse.json({ error: 'Tournament is already completed' }, { status: 400 });
      }

      const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
      if (rrMatches.length === 0) {
        return NextResponse.json({ error: 'No round robin matches found' }, { status: 400 });
      }
      const currentRound = Math.max(...rrMatches.map(m => m.bracketRound ?? 1));
      const incompleteCurrent = rrMatches.filter(m => (m.bracketRound ?? 1) === currentRound && !m.winnerId);
      if (incompleteCurrent.length > 0) {
        return NextResponse.json({ error: 'Finish the current round robin round before starting bracket' }, { status: 400 });
      }

      const existingBracketMatches = (tournament.matches ?? []).filter(m => m.round === 'bracket');
      const hasPlayedBracket = existingBracketMatches.some(m =>
        m.games.length > 0 || (!!m.winnerId && m.player1Id !== 'BYE' && m.player2Id !== 'BYE')
      );
      if (hasPlayedBracket) {
        return NextResponse.json({ error: 'Cannot rebuild bracket after bracket games have been played' }, { status: 400 });
      }

      if (existingBracketMatches.length > 0) {
        const removeIds = existingBracketMatches.map(m => m.id);
        tournament.matches = (tournament.matches ?? []).filter(m => m.round !== 'bracket');
        await unregisterMatchesIndex(removeIds);
      }

      tournament.status = 'bracket';
      tournament.bracketStartedAt = tournament.bracketStartedAt ?? new Date().toISOString();
      tournament.playerRanking = undefined;
      const newBracketMatches = createBracketMatches(tournament, true);
      if (newBracketMatches.length === 0) {
        return NextResponse.json({ error: 'Failed to create bracket matches' }, { status: 400 });
      }
      if (!tournament.matches) tournament.matches = [];
      tournament.matches.push(...newBracketMatches);
      await registerMatchesIndex(newBracketMatches);
      await setTournament(tournament);
      await saveData();
      return NextResponse.json(tournament);
    }

    if (action === 'addRoundRobinRound') {
      if (bracketStarted || tournament.status === 'completed') {
        return NextResponse.json({ error: 'Cannot add rounds after bracket has started' }, { status: 400 });
      }

      // Increment the planned round count first so that advanceRoundRobinRound's guard
      // (nextRound > tournament.roundRobinRounds) allows the new round to be created.
      tournament.roundRobinRounds += 1;
      const newMatches = advanceRoundRobinRound(tournament);

      if (newMatches.length === 0) {
        return NextResponse.json({ error: 'Failed to create new round' }, { status: 400 });
      }

      if (!tournament.matches) tournament.matches = [];
      tournament.matches.push(...newMatches);
      await registerMatchesIndex(newMatches);
      await setTournament(tournament);
      await saveData();
      return NextResponse.json(tournament);
    }

    if (activePlayers !== undefined) {
      if (bracketStarted || tournament.status === 'completed') {
        return NextResponse.json({ error: 'Cannot edit active players after bracket has started' }, { status: 400 });
      }
      // Determine which players were just removed
      const removedIds = new Set(
        tournament.players.filter(id => !activePlayers.includes(id))
      );
      if (removedIds.size > 0 && tournament.status === 'roundRobin') {
        // Find the current (highest) RR round
        const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
        const currentRound = rrMatches.length > 0 ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1)) : 1;
        // Drop all unplayed matches in the current round to re-pair remaining players
        tournament.matches = (tournament.matches ?? []).filter(m => {
          if (m.round !== 'roundRobin' || (m.bracketRound ?? 1) !== currentRound) return true;
          if (m.games.length > 0 || (m.winnerId && m.player2Id !== 'BYE')) return true; // already played — keep for stats; bye matches (auto-won, no real games) are dropped so they can be re-paired
          return false; // drop unplayed matches to re-pair
        });
        // Re-create pairings for the remaining active players
        const newMatches = createRoundRobinPairings(activePlayers, tournament.id, currentRound, tournament.rrBestOf ?? 1);
        if (!tournament.matches) tournament.matches = [];
        tournament.matches.push(...newMatches);
        await registerMatchesIndex(newMatches);
      }
      tournament.activePlayers = activePlayers;
    }

    if (players !== undefined) {
      if (bracketStarted || tournament.status === 'completed') {
        return NextResponse.json(
          { error: 'Cannot edit tournament players after bracket has started' },
          { status: 400 }
        );
      }

      // ── Round-robin stage ────────────────────────────────────────────────────
      // Detect newly added players (not previously in the roster)
      const newPlayerIds = players.filter(pid => !tournament.players.includes(pid));

      // Append new players to the roster and to activePlayers (if that field is in use)
      tournament.players = [...new Set([...tournament.players, ...newPlayerIds])];
      if (tournament.activePlayers !== undefined) {
        tournament.activePlayers = [...new Set([...tournament.activePlayers, ...newPlayerIds])];
      }

      // For newly added players during round robin, create current-round matches
      if (newPlayerIds.length > 0 && tournament.status === 'roundRobin') {
        const rrMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
        const currentRound = rrMatches.length > 0
          ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1))
          : 1;

        const unmatched = [...newPlayerIds];
        const freshMatches = [];

        // Pair new players with each other first (2 at a time)
        while (unmatched.length >= 2) {
          const p1 = unmatched.shift()!;
          const p2 = unmatched.shift()!;
          freshMatches.push({
            id: Date.now().toString() + Math.random(),
            tournamentId: tournament.id,
            player1Id: p1,
            player2Id: p2,
            round: 'roundRobin' as const,
            bracketRound: currentRound,
            bestOf: tournament.rrBestOf ?? 1,
            games: [],
          });
        }

        // One leftover — try to slot them into an existing bye match
        if (unmatched.length === 1) {
          const newPlayerId = unmatched[0];
          const byeIdx = (tournament.matches ?? []).findIndex(m =>
            m.round === 'roundRobin' &&
            (m.bracketRound ?? 1) === currentRound &&
            m.player2Id === 'BYE'
          );
          if (byeIdx !== -1) {
            tournament.matches![byeIdx] = {
              ...tournament.matches![byeIdx],
              player2Id: newPlayerId,
              winnerId: undefined,
            };
          } else {
            // No existing bye match, create a new bye match for the leftover player
            const byeMatch = {
              id: Date.now().toString() + Math.random(),
              tournamentId: tournament.id,
              player1Id: newPlayerId,
              player2Id: 'BYE',
              round: 'roundRobin' as const,
              bracketRound: currentRound,
              bestOf: tournament.rrBestOf ?? 1,
              games: [],
              winnerId: newPlayerId, // Automatic win
            };
            freshMatches.push(byeMatch);
          }
        }

        if (freshMatches.length > 0) {
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...freshMatches);
          await registerMatchesIndex(freshMatches);
        }
      }

      await syncTournamentPlayers(tournament);
    }

    if (status) {
      if (status === 'bracket') {
        return NextResponse.json(
          { error: 'Use action=startBracket to start bracket stage' },
          { status: 400 }
        );
      }
      tournament.status = status;
    }

    await setTournament(tournament);
    await saveData();
    return NextResponse.json(tournament);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update tournament' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Tournament ID required' }, { status: 400 });
    }

    const tournament = await getTournament(id);
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Deletes tournament doc, removes from indexes, cleans match index, removes player refs
    await deleteTournament(id);

    return NextResponse.json({ message: 'Tournament deleted successfully' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete tournament' }, { status: 500 });
  }
}
