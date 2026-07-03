import { NextRequest, NextResponse } from 'next/server';
import { getTournament, setTournament, saveData, registerMatchesIndex, unregisterMatchesIndex } from '../../../../../data/data';
import { resyncRoundRobinMatches } from '../../../../../lib/tournament';

/**
 * Atomic, on-demand "Refresh Matches" operation — regenerates round-robin
 * pairings for the current round so every active player who hasn't completed
 * a real match yet is paired exactly once (or given a bye), without changing
 * the roster at all. Safe to call at any time during round robin: already
 * -played matches and all bracket matches are never touched (see
 * `resyncRoundRobinMatches`). This is also run automatically as part of the
 * add/remove-players endpoint; this endpoint exists so the host can trigger
 * the same fix-up on demand (e.g. if matches ever look out of sync).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournament = await getTournament(id);
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const bracketMatches = (tournament.matches ?? []).filter(m => m.round === 'bracket');
    const bracketStarted = Boolean(
      tournament.bracketStartedAt || bracketMatches.length > 0 || tournament.status === 'bracket'
    );
    if (bracketStarted || tournament.status === 'completed') {
      return NextResponse.json(
        { error: 'Matches can only be refreshed during the round robin stage' },
        { status: 400 }
      );
    }

    const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);
    tournament.matches = matches;
    await unregisterMatchesIndex(removedMatchIds);
    await registerMatchesIndex(addedMatches);
    await setTournament(tournament);
    await saveData();

    return NextResponse.json(tournament);
  } catch (error) {
    console.error('Error refreshing tournament matches:', error);
    return NextResponse.json({ error: 'Failed to refresh matches' }, { status: 500 });
  }
}
