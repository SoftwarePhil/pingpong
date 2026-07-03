import { NextRequest, NextResponse } from 'next/server';
import { Tournament, Match, BracketConfig } from '../../../types/pingpong';
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
    const { id, status, action }: {
      id: string;
      status?: 'roundRobin' | 'bracket' | 'completed';
      action?: 'advanceRound' | 'addRoundRobinRound' | 'startBracket';
    } = body;
    // Note: adding/removing players is handled by its own atomic endpoint —
    // PATCH /api/tournaments/[id]/players — not by this PUT handler. See
    // that route for the diff-based { add, remove } roster operation, which
    // also resyncs round-robin matches in the same atomic pass.

    const tournament = await getTournament(id);

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const bracketMatches = (tournament.matches ?? []).filter(m => m.round === 'bracket');
    const bracketStarted = Boolean(tournament.bracketStartedAt || bracketMatches.length > 0 || tournament.status === 'bracket');

if (action === 'advanceRound') {
      if (!bracketStarted && tournament.status !== 'completed') {
        // Check if all matches in the CURRENT round are completed. Scoped to
        // just the current (highest) round — not all rounds — so that an
        // edited/incomplete match left behind in an earlier round (e.g. via
        // the round-picker in the UI) never blocks advancing an
        // already-finished current round.
        const rrMatchesForCheck = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
        const currentRRRound = rrMatchesForCheck.length > 0
          ? Math.max(...rrMatchesForCheck.map(m => m.bracketRound ?? 1))
          : 1;
        const incompleteCurrentRoundMatches = rrMatchesForCheck.filter(m =>
          (m.bracketRound ?? 1) === currentRRRound && !m.winnerId
        );

        if (incompleteCurrentRoundMatches.length > 0) {
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
      const firstRound = rrMatches.filter(m => (m.bracketRound ?? 1) === 1);
      const incompleteFirstRound = firstRound.filter(m => !m.winnerId);
      if (incompleteFirstRound.length > 0) {
        return NextResponse.json({ error: 'Finish round robin round 1 before starting bracket' }, { status: 400 });
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

      // Support committing a user-configured bracket from the live preview in the UI.
      // The client can send the exact (edited) initial bracket matches (R1 + optional play-in)
      // and/or a bracketConfig (e.g. playInMode).
      const initialBracketMatches: Match[] | undefined = (body as { initialBracketMatches?: Match[] }).initialBracketMatches;
      const incomingConfig = (body as { bracketConfig?: BracketConfig }).bracketConfig;
      if (incomingConfig) {
        tournament.bracketConfig = incomingConfig;
      }
      let newBracketMatches: Match[];

      if (initialBracketMatches && Array.isArray(initialBracketMatches) && initialBracketMatches.length > 0) {
        // Basic validation: only unplayed bracket matches for round 0 (play-in) or 1+
        const invalid = initialBracketMatches.some(m =>
          m.round !== 'bracket' ||
          (m.games && m.games.length > 0) ||
          (m.winnerId && m.player1Id !== 'BYE' && m.player2Id !== 'BYE' && (m.bracketRound ?? 0) > 0)
        );
        if (invalid) {
          return NextResponse.json({ error: 'Invalid initial bracket matches for preview commit' }, { status: 400 });
        }

        // Run normal creation on a clone purely for side-effects (playerRanking etc.)
        try {
          const clone: Tournament = {
            ...tournament,
            matches: [...(tournament.matches ?? [])],
            bracketRounds: tournament.bracketRounds.map(r => ({ ...r })),
          };
          createBracketMatches(clone, true);
          if (clone.playerRanking) tournament.playerRanking = clone.playerRanking;
        } catch {}

        newBracketMatches = initialBracketMatches.map(m => ({ ...m }));
      } else {
        newBracketMatches = createBracketMatches(tournament, true);
      }

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
