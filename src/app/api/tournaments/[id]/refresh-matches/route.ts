import { NextRequest, NextResponse } from 'next/server';
import { getTournament, mutateTournament } from '../../../../../data/data';
import { resyncRoundRobinMatches } from '../../../../../lib/tournament';
import { requireAdmin } from '../../../../../lib/auth';
import { reject, tournamentErrorResponse } from '../../../../../lib/tournamentErrors';

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
  const { admin, denied } = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const tournament = await getTournament(id);
    if (tournament?.clubId !== admin.clubId) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const { tournament: refreshed } = await mutateTournament(id, tournament => {
      const bracketStarted = Boolean(
        tournament.bracketStartedAt ||
        (tournament.matches ?? []).some(m => m.round === 'bracket') ||
        tournament.status === 'bracket'
      );
      if (bracketStarted || tournament.status === 'completed') {
        reject('Matches can only be refreshed during the round robin stage');
      }
      tournament.matches = resyncRoundRobinMatches(tournament).matches;
    });

    return NextResponse.json(refreshed);
  } catch (error) {
    const handled = tournamentErrorResponse(error);
    if (handled) return handled;
    console.error('Error refreshing tournament matches:', error);
    return NextResponse.json({ error: 'Failed to refresh matches' }, { status: 500 });
  }
}
