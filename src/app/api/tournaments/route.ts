import { NextRequest, NextResponse } from 'next/server';
import { Tournament } from '../../../types/pingpong';
import { getTournaments, saveData, setTournament, getTournament, deleteTournament, registerMatchesIndex, syncTournamentPlayers } from '../../../data/data';
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
    const { name, roundRobinRounds, bracketRounds, players }: { name: string; roundRobinRounds: number; bracketRounds: { round: number; bestOf: number }[]; players: string[] } = body;
    const uniquePlayers = [...new Set(players)];
    if (!name || !roundRobinRounds || !bracketRounds || !uniquePlayers || uniquePlayers.length < 2) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    const newTournament: Tournament = {
      id: Date.now().toString(),
      name,
      startDate: new Date().toISOString(),
      status: 'roundRobin',
      roundRobinRounds,
      bracketRounds,
      players: uniquePlayers,
      matches: [], // Will be populated with embedded matches
    };

    // Create first round robin pairings
    const shuffledPlayers = [...uniquePlayers].sort(() => Math.random() - 0.5);
    const embeddedMatches = createRoundRobinPairings(shuffledPlayers, newTournament.id, 1);

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
    const { id, status, action }: { id: string; status?: 'roundRobin' | 'bracket' | 'completed'; action?: 'advanceRound' } = body;

    const tournament = await getTournament(id);

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

if (action === 'advanceRound') {
      if (tournament.status === 'roundRobin') {
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
          // No more round robin rounds — transition to bracket
          tournament.status = 'bracket';
          const bracketMatches = createBracketMatches(tournament);
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...bracketMatches);
          await registerMatchesIndex(bracketMatches);
        } else {
          if (!tournament.matches) tournament.matches = [];
          tournament.matches.push(...newMatches);
          await registerMatchesIndex(newMatches);
        }

        await setTournament(tournament);
        await saveData();
      } else if (tournament.status === 'bracket') {
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

    if (status) {
      const oldStatus = tournament.status;
      tournament.status = status;
      // If changing to bracket status or already bracket but no matches, create bracket matches
      if (status === 'bracket' && (oldStatus !== 'bracket' || !(tournament.matches ?? []).some(m => m.round === 'bracket'))) {
        const bracketMatches = createBracketMatches(tournament, false); // Don't create main bracket yet
        if (!tournament.matches) tournament.matches = [];
        tournament.matches.push(...bracketMatches);
        await registerMatchesIndex(bracketMatches);
        await saveData();
      }
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
