import { NextRequest, NextResponse } from 'next/server';
import {
  getTournament,
  setTournament,
  saveData,
  registerMatchesIndex,
  unregisterMatchesIndex,
  syncTournamentPlayers,
  getPlayers,
} from '../../../../../data/data';
import { resyncRoundRobinMatches } from '../../../../../lib/tournament';

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
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const bracketMatches = (tournament.matches ?? []).filter(m => m.round === 'bracket');
    const bracketStarted = Boolean(
      tournament.bracketStartedAt || bracketMatches.length > 0 || tournament.status === 'bracket'
    );
    if (bracketStarted || tournament.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot edit players after bracket has started' },
        { status: 400 }
      );
    }

    // New player ids must correspond to real player records — otherwise
    // they'd silently create phantom matches with no display name.
    if (add.length > 0) {
      const knownIds = new Set((await getPlayers()).map(p => p.id));
      const unknown = add.filter(pid => !knownIds.has(pid));
      if (unknown.length > 0) {
        return NextResponse.json(
          { error: `Unknown player id(s): ${unknown.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const currentActive = tournament.activePlayers ?? tournament.players;
    tournament.players = [...new Set([...tournament.players, ...add])];
    tournament.activePlayers = [...new Set([...currentActive, ...add])].filter(
      pid => !remove.includes(pid)
    );

    if (tournament.status === 'roundRobin') {
      const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);
      tournament.matches = matches;
      await unregisterMatchesIndex(removedMatchIds);
      await registerMatchesIndex(addedMatches);
    }

    await syncTournamentPlayers(tournament);
    await setTournament(tournament);
    await saveData();

    return NextResponse.json(tournament);
  } catch (error) {
    console.error('Error updating tournament players:', error);
    return NextResponse.json({ error: 'Failed to update tournament players' }, { status: 500 });
  }
}
