import { cascadeRoundRobinPlayerSwap } from '../lib/tournament';
import { Match } from '../types/pingpong';

function makeMatch(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
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

describe('cascadeRoundRobinPlayerSwap', () => {
  // ── happy-path ─────────────────────────────────────────────────────────────

  it('updates player1Id in the target match', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p3', 'p2');
    expect(result.find(m => m.id === 'm1')!.player1Id).toBe('p3');
  });

  it('updates player2Id in the target match', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p4');
    expect(result.find(m => m.id === 'm1')!.player2Id).toBe('p4');
  });

  it('does not mutate the input array', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    cascadeRoundRobinPlayerSwap(matches, 'm1', 'p3', 'p4');
    expect(matches[0].player1Id).toBe('p1');
  });

  it('cascades a displaced player into the match that held the incoming player', () => {
    // Round: m1 = p1 vs p2, m2 = p3 vs p4
    // Swap m1 to p1 vs p3 → p2 should land where p3 was (m2)
    const matches = [
      makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m1 = result.find(m => m.id === 'm1')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m1.player1Id).toBe('p1');
    expect(m1.player2Id).toBe('p3');
    // p3 came from m2, so p2 (displaced from m1) takes its slot
    expect(m2.player1Id).toBe('p2');
    expect(m2.player2Id).toBe('p4');
  });

  it('cascades both displaced players when both sides of a match change', () => {
    // m1 = p1 vs p2, m2 = p3 vs p4
    // Swap m1 to p3 vs p4 → both p1 and p2 should fill m2
    const matches = [
      makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p3', 'p4');
    const m1 = result.find(m => m.id === 'm1')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m1.player1Id).toBe('p3');
    expect(m1.player2Id).toBe('p4');
    expect(m2.player1Id).toBe('p1');
    expect(m2.player2Id).toBe('p2');
  });

  it('leaves matches in a different bracketRound untouched', () => {
    const matches = [
      makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { bracketRound: 2, player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m2.player1Id).toBe('p3');
    expect(m2.player2Id).toBe('p4');
  });

  it('leaves a match that already has games untouched', () => {
    const playedGame = { id: 'g1', matchId: 'm2', player1Id: 'p3', player2Id: 'p4', score1: 11, score2: 5, date: '' };
    const matches = [
      makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { player1Id: 'p3', player2Id: 'p4', games: [playedGame] }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m2.player1Id).toBe('p3');
    expect(m2.player2Id).toBe('p4');
  });

  it('leaves a match that already has a winner untouched', () => {
    const matches = [
      makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m2.player1Id).toBe('p3');
    expect(m2.player2Id).toBe('p4');
  });

  it('leaves bracket matches in the same round untouched', () => {
    const matches = [
      makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { round: 'bracket',    bracketRound: 1, player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m2.player1Id).toBe('p3');
  });

  it('handles a swap where neither player changes (no-op)', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p2');
    expect(result[0].player1Id).toBe('p1');
    expect(result[0].player2Id).toBe('p2');
  });

  // ── guard / error cases ────────────────────────────────────────────────────

  it('throws when the match is not found', () => {
    expect(() =>
      cascadeRoundRobinPlayerSwap([], 'missing', 'p1', 'p2')
    ).toThrow('Match missing not found');
  });

  it('throws when the match is not a roundRobin match', () => {
    const matches = [makeMatch('m1', { round: 'bracket' })];
    expect(() =>
      cascadeRoundRobinPlayerSwap(matches, 'm1', 'p3', 'p4')
    ).toThrow('Players can only be changed in round robin matches');
  });

  it('throws when the match already has games', () => {
    const playedGame = { id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' };
    const matches = [makeMatch('m1', { games: [playedGame] })];
    expect(() =>
      cascadeRoundRobinPlayerSwap(matches, 'm1', 'p3', 'p4')
    ).toThrow('Cannot change players after games have been played');
  });

  it('throws when the two new players are the same', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    expect(() =>
      cascadeRoundRobinPlayerSwap(matches, 'm1', 'p3', 'p3')
    ).toThrow('Player 1 and Player 2 must be different');
  });
});

describe('cascadeRoundRobinPlayerSwap with a bye', () => {
  it('moves the displaced player onto the bye when the bye holder is swapped into a match', () => {
    // m1 = p1 vs p2, bye = p3 (auto-won)
    // Swap m1 to p1 vs p3 → p2 should now hold the bye
    const matches = [
      makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('bye', { player1Id: 'p3', player2Id: 'BYE', winnerId: 'p3' }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m1 = result.find(m => m.id === 'm1')!;
    const bye = result.find(m => m.id === 'bye')!;
    expect([m1.player1Id, m1.player2Id]).toEqual(['p1', 'p3']);
    expect(bye.player1Id).toBe('p2');
    expect(bye.player2Id).toBe('BYE');
    expect(bye.winnerId).toBe('p2');

    // Every player appears exactly once in the round
    const ids = result.flatMap(m => [m.player1Id, m.player2Id]).filter(p => p !== 'BYE');
    expect(ids.sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('handles swapping both players of a match with the bye holder involved', () => {
    // m1 = p1 vs p2, m2 = p3 vs p4, bye = p5
    // Swap m1 to p5 vs p3 → p1 takes p5's bye, p2 takes p3's slot in m2
    const matches = [
      makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { player1Id: 'p3', player2Id: 'p4' }),
      makeMatch('bye', { player1Id: 'p5', player2Id: 'BYE', winnerId: 'p5' }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p5', 'p3');
    const bye = result.find(m => m.id === 'bye')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(bye.player1Id).toBe('p1');
    expect(bye.winnerId).toBe('p1');
    expect([m2.player1Id, m2.player2Id]).toEqual(['p2', 'p4']);
    const ids = result.flatMap(m => [m.player1Id, m.player2Id]).filter(p => p !== 'BYE');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not touch a bye match in a different round', () => {
    const matches = [
      makeMatch('m1', { player1Id: 'p1', player2Id: 'p2', bracketRound: 2 }),
      makeMatch('bye', { player1Id: 'p3', player2Id: 'BYE', winnerId: 'p3', bracketRound: 1 }),
    ];
    const result = cascadeRoundRobinPlayerSwap(matches, 'm1', 'p1', 'p3');
    expect(result.find(m => m.id === 'bye')).toEqual(matches[1]);
  });
});
