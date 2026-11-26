import { NextRequest, NextResponse } from 'next/server';
import {
  getTournament,
  mutateTournament,
  syncTournamentPlayers,
  getPlayers,
} from '../../../../../data/data';
import { resyncRoundRobinMatches } from '../../../../../lib/tournament';
import { requireAdmin } from '../../../../../lib/auth';
import { getRoundRobinFormat, isValidDoublesRoster } from '../../../../../lib/matchFormat';
import { reject, tournamentErrorResponse } from '../../../../../lib/tournamentErrors';

/** Validates and de-duplicates a request-body field into a clean string[] (ignores non-string entries). */
function toUniqueStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string'))];
}

/**
 * Atomic add/remove-players endpoint — intentionally separate from the main
 * tournament PUT endpoint (see /api/tournaments). This is a diff-based
 * operation: `{ add?: string[], remove?: string[] }`. The server computes the
 * resulting roster/active-player list itself and, whenever the tournament is
 * still in the round-robin stage, immediately resyncs the current round's
 * matches in the same atomic pass via `resyncRoundRobinMatches` — so a single
 * request either fully adds/removes players *and* fixes up matches, or fails
 * entirely with no partial/duplicated state.
 *
 * "Removing" a player only deactivates them (drops them from `activePlayers`);
 * they remain in the permanent `players` roster for historical stats, exactly
 * like the previous behavior. Re-adding a previously removed, not-yet-played
 * player simply returns them to the pairing pool.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { admin, denied } = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await request.json();

    const add = toUniqueStringArray(body?.add);
    const remove = toUniqueStringArray(body?.remove);

    if (add.length === 0 && remove.length === 0) {
      return NextResponse.json(
        { error: 'Provide at least one player id in "add" or "remove"' },
        { status: 400 }
      );
    }
    const overlap = add.filter(pid => remove.includes(pid));
    if (overlap.length > 0) {
      return NextResponse.json(
        { error: `Player(s) cannot be both added and removed in the same request: ${overlap.join(', ')}` },
        { status: 400 }
      );
    }

    const tournament = await getTournament(id);
    if (tournament?.clubId !== admin.clubId) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // New player ids must correspond to real player records — otherwise
    // they'd silently create phantom matches with no display name.
    if (add.length > 0) {
      const knownIds = new Set((await getPlayers(admin.clubId)).map(p => p.id));
      const unknown = add.filter(pid => !knownIds.has(pid));
      if (unknown.length > 0) {
        return NextResponse.json(
          { error: `Unknown player id(s): ${unknown.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const { tournament: updated } = await mutateTournament(id, tournament => {
      const bracketStarted = Boolean(
        tournament.bracketStartedAt ||
        (tournament.matches ?? []).some(m => m.round === 'bracket') ||
        tournament.status === 'bracket'
      );
      if (bracketStarted || tournament.status === 'completed') {
        reject('Cannot edit players after bracket has started');
      }

      const currentActive = tournament.activePlayers ?? tournament.players;
      const currentRRMatches = (tournament.matches ?? []).filter(match => match.round === 'roundRobin');
      const currentRound = currentRRMatches.length > 0
        ? Math.max(...currentRRMatches.map(match => match.bracketRound ?? 1))
        : 1;
      const currentRoundMatches = currentRRMatches.filter(match => (match.bracketRound ?? 1) === currentRound);
      const requestedActive = [...new Set([...currentActive, ...add])].filter(pid => !remove.includes(pid));
      if (getRoundRobinFormat(tournament, currentRound) === 'doubles') {
        if (currentRoundMatches.some(match => match.games.length > 0)) {
          reject('Cannot change players after a doubles round has started');
        }
        if (!isValidDoublesRoster(requestedActive)) {
          reject('A 2v2 round requires at least four active players in groups of four');
        }
      }
      tournament.players = [...new Set([...tournament.players, ...add])];
      tournament.activePlayers = requestedActive;

      if (tournament.status === 'roundRobin') {
        tournament.matches = resyncRoundRobinMatches(tournament).matches;
      }
    });

    await syncTournamentPlayers(updated);

    return NextResponse.json(updated);
  } catch (error) {
    const handled = tournamentErrorResponse(error);
    if (handled) return handled;
    console.error('Error updating tournament players:', error);
    return NextResponse.json({ error: 'Failed to update tournament players' }, { status: 500 });
  }
}
