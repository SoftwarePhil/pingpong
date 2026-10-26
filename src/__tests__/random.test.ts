import { newId, shuffle } from '../lib/random';
import { createMatch, createRoundRobinPairings } from '../lib/tournament';
import { getPlayerJoinedDate } from '../lib/player';
import { getRoundRobinStandings } from '../lib/standings';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns version 4 UUIDs that do not repeat', () => {
    const ids = Array.from({ length: 2000 }, newId);
    ids.forEach(id => expect(id).toMatch(UUID_V4));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds a valid UUID where crypto.randomUUID is unavailable (plain HTTP)', () => {
    const randomUUID = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const ids = Array.from({ length: 200 }, newId);
      ids.forEach(id => expect(id).toMatch(UUID_V4));
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true });
    }
  });
});

describe('shuffle', () => {
  it('returns a reordered copy with the same items and leaves the input alone', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const output = shuffle(input);
    expect(output).not.toBe(input);
    expect([...output].sort()).toEqual(input);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('puts every item first about equally often', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    const runs = 8000;
    for (let i = 0; i < runs; i++) counts[shuffle(['a', 'b', 'c', 'd'])[0]]++;
    // Each item should lead ~2000 times; the biased sort-based shuffle
    // missed this by a wide margin for some items.
    Object.values(counts).forEach(count => expect(Math.abs(count - runs / 4)).toBeLessThan(250));
  });
});

describe('createMatch', () => {
  const base = { tournamentId: 't1', round: 'roundRobin' as const, bracketRound: 1, bestOf: 1 };

  it('stamps a fresh id, the creation time and an empty game list', () => {
    const match = createMatch({ ...base, player1Id: 'p1', player2Id: 'p2' }, '2026-10-25T10:00:00.000Z');
    expect(match).toEqual({
      ...base,
      id: expect.stringMatching(UUID_V4),
      createdAt: '2026-10-25T10:00:00.000Z',
      player1Id: 'p1',
      player2Id: 'p2',
      games: [],
    });
    expect(match).not.toHaveProperty('winnerId');
  });

  it('records a singles match against a BYE as an automatic win, on either side', () => {
    expect(createMatch({ ...base, player1Id: 'p1', player2Id: 'BYE' }).winnerId).toBe('p1');
    expect(createMatch({ ...base, player1Id: 'BYE', player2Id: 'p2' }).winnerId).toBe('p2');
  });

  it('does not count a bye as a win or a match played in the standings', () => {
    const bye = createMatch({ ...base, player1Id: 'p1', player2Id: 'BYE' });
    const real = { ...createMatch({ ...base, player1Id: 'p2', player2Id: 'p3' }), winnerId: 'p2',
      games: [{ id: 'g1', player1Id: 'p2', player2Id: 'p3', score1: 11, score2: 5, date: '2026-10-25T10:00:00.000Z' }] };

    const standings = getRoundRobinStandings(['p1', 'p2', 'p3'], [bye, real]);

    expect(standings.p1).toEqual({ wins: 0, losses: 0, played: 0, gamesPlayed: 0, pointDiff: 0 });
    expect(standings.p2).toMatchObject({ wins: 1, played: 1 });
  });

  it('keeps an explicit winner', () => {
    expect(createMatch({ ...base, player1Id: 'p1', player2Id: 'BYE', winnerId: 'other' }).winnerId).toBe('other');
  });

  it('gives every match in a round its own id even when created in the same millisecond', () => {
    const players = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const matches = createRoundRobinPairings(players, 't1');
    expect(new Set(matches.map(m => m.id)).size).toBe(matches.length);
  });
});

describe('getPlayerJoinedDate', () => {
  it('uses createdAt when present', () => {
    expect(getPlayerJoinedDate({ id: newId(), createdAt: '2026-10-25T10:00:00.000Z' })?.toISOString())
      .toBe('2026-10-25T10:00:00.000Z');
  });

  it('falls back to the timestamp id of players created before createdAt existed', () => {
    expect(getPlayerJoinedDate({ id: '1771891200000' })?.toISOString()).toBe('2026-02-24T00:00:00.000Z');
  });

  it('is unknown for a UUID without createdAt', () => {
    expect(getPlayerJoinedDate({ id: newId() })).toBeUndefined();
  });
});
