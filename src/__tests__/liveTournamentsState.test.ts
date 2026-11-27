import {
  applyTournamentRemoval,
  applyTournamentUpdate,
  didTournamentSettingsChange,
  diffChangedMatchIds,
  nextReconnectDelayMs,
} from '../lib/liveTournamentsState';
import type { Match, Tournament } from '../types/pingpong';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    tournamentId: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
    round: 'roundRobin',
    bracketRound: 1,
    bestOf: 1,
    games: [],
    ...overrides,
  };
}

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    clubId: 'club-dallas',
    name: 'Friday Cup',
    startDate: '2026-11-27T12:00:00.000Z',
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
    players: ['p1', 'p2'],
    matches: [makeMatch()],
    version: 1,
    ...overrides,
  };
}

describe('liveTournamentsState helpers', () => {
  it('applies newer versions and ignores older or duplicate versions', () => {
    const v2 = makeTournament({ version: 2, name: 'v2' });
    const v1 = makeTournament({ version: 1, name: 'v1' });
    const v3 = makeTournament({ version: 3, name: 'v3' });

    const stale = applyTournamentUpdate([v2], v1, 1);
    expect(stale.applied).toBe(false);
    expect(stale.tournaments[0].name).toBe('v2');

    const duplicate = applyTournamentUpdate([v2], { ...v2, name: 'dup' }, 2);
    expect(duplicate.applied).toBe(false);
    expect(duplicate.tournaments[0].name).toBe('v2');

    const newer = applyTournamentUpdate([v2], v3, 3);
    expect(newer.applied).toBe(true);
    expect(newer.tournaments[0].name).toBe('v3');
    expect(newer.tournaments[0].version).toBe(3);
  });

  it('inserts newly created tournaments when not already in state', () => {
    const t1 = makeTournament({ id: 't1', version: 1 });
    const t2 = makeTournament({ id: 't2', version: 1 });
    const res = applyTournamentUpdate([t1], t2, 1);
    expect(res.applied).toBe(true);
    expect(res.tournaments.map(t => t.id)).toEqual(['t1', 't2']);
  });

  it('transitions ended tournaments to completed and deletes removed tournaments', () => {
    const active = makeTournament({ id: 't1', status: 'bracket', version: 4 });
    const completed = makeTournament({ id: 't1', status: 'completed', version: 5 });

    const ended = applyTournamentRemoval([active], 't1', 'ended', completed, 5);
    expect(ended.applied).toBe(true);
    expect(ended.tournaments[0].status).toBe('completed');
    expect(ended.tournaments[0].version).toBe(5);

    const deleted = applyTournamentRemoval([active], 't1', 'deleted');
    expect(deleted.applied).toBe(true);
    expect(deleted.tournaments).toEqual([]);
  });

  it('detects which matches changed or were removed between snapshots', () => {
    const prev = makeTournament({
      matches: [
        makeMatch({ id: 'm1', games: [] }),
        makeMatch({ id: 'm2', games: [] }),
        makeMatch({ id: 'm3', games: [] }),
      ],
    });
    const next = makeTournament({
      version: 2,
      matches: [
        makeMatch({ id: 'm1', games: [] }),
        makeMatch({
          id: 'm2',
          games: [{ id: 'g1', clubId: 'club-dallas', matchId: 'm2', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 7, date: '2026-11-27T12:05:00.000Z' }],
          winnerId: 'p1',
        }),
      ],
    });

    expect(diffChangedMatchIds(prev, next)).toEqual(['m2', 'm3']);
  });

  it('detects tournament roster and settings changes', () => {
    const prev = makeTournament({ players: ['p1', 'p2'], rrPairingStrategy: 'swiss' });
    expect(didTournamentSettingsChange(prev, makeTournament({ players: ['p1', 'p2'], rrPairingStrategy: 'swiss' }))).toBe(false);
    expect(didTournamentSettingsChange(prev, makeTournament({ players: ['p1', 'p2', 'p3'], rrPairingStrategy: 'swiss' }))).toBe(true);
    expect(didTournamentSettingsChange(prev, makeTournament({ players: ['p1', 'p2'], rrPairingStrategy: 'random' }))).toBe(true);
  });

  it('computes capped exponential reconnect backoff with jitter', () => {
    expect(nextReconnectDelayMs(0, 0)).toBe(1000);
    expect(nextReconnectDelayMs(1, 0)).toBe(2000);
    expect(nextReconnectDelayMs(2, 0)).toBe(4000);
    expect(nextReconnectDelayMs(5, 0)).toBe(30000);
    expect(nextReconnectDelayMs(10, 1)).toBe(37500);
  });
});
