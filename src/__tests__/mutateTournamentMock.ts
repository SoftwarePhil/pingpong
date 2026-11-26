import { Tournament } from '../types/pingpong';
import { TournamentNotFoundError } from '../lib/tournamentErrors';

/**
 * A stand-in for data.ts's mutateTournament in route tests that mock the data
 * module: it runs the change on a copy of what `getTournament` returns, as the
 * real one does, and keeps every tournament it would have saved in `saved`.
 * The real retry and storage behaviour is covered by doublesPersistence.test.ts.
 */
export function fakeMutateTournament(getTournament: (id: string) => Promise<Tournament | null>) {
  const saved: Tournament[] = [];
  const mutate = async <T>(id: string, change: (tournament: Tournament) => T | Promise<T>) => {
    const stored = await getTournament(id);
    if (!stored) throw new TournamentNotFoundError(id);
    const tournament = structuredClone(stored);
    const result = await change(tournament);
    tournament.version = (stored.version ?? 0) + 1;
    saved.push(tournament);
    return { tournament, result };
  };
  return { mutate, saved };
}
