import { cascadeBracketPlayerSwap } from '../lib/tournament';
import { Match } from '../types/pingpong';

function makeMatch(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    tournamentId: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
    round: 'bracket',
    bracketRound: 1,
    bestOf: 3,
    games: [],
    ...overrides,
  };
}

describe('cascadeBracketPlayerSwap', () => {
  it('updates player1Id in the target match', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p3', 'p2');
    expect(result.find(m => m.id === 'm1')!.player1Id).toBe('p3');
  });

  it('updates player2Id in the target match', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p1', 'p4');
    expect(result.find(m => m.id === 'm1')!.player2Id).toBe('p4');
  });

  it('does not mutate the input array', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    cascadeBracketPlayerSwap(matches, 'm1', 'p3', 'p4');
    expect(matches[0].player1Id).toBe('p1');
  });

  it('cascades a displaced player into the other R1 match that held the incoming player', () => {
    const matches = [
      makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m1 = result.find(m => m.id === 'm1')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m1.player1Id).toBe('p1');
    expect(m1.player2Id).toBe('p3');
    // p3 came from m2 so p2 (displaced from m1) takes its slot
    expect(m2.player1Id).toBe('p2');
    expect(m2.player2Id).toBe('p4');
  });

  it('cascades a displaced player in R2 into another unplayed R2 match', () => {
    const matches = [
      makeMatch('m1', { bracketRound: 2, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { bracketRound: 2, player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m1 = result.find(m => m.id === 'm1')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m1.player1Id).toBe('p1');
    expect(m1.player2Id).toBe('p3');
    // p3 came from m2 so p2 (displaced from m1) takes its slot
    expect(m2.player1Id).toBe('p2');
    expect(m2.player2Id).toBe('p4');
  });

  it('does not cascade across different bracket rounds', () => {
    const matches = [
      makeMatch('m1', { bracketRound: 2, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m2 = result.find(m => m.id === 'm2')!;
    // m2 is in a different round — should be untouched
    expect(m2.player1Id).toBe('p3');
    expect(m2.player2Id).toBe('p4');
  });

  it('leaves matches with games played untouched during cascade', () => {
    const playedGame = { id: 'g1', matchId: 'm2', player1Id: 'p3', player2Id: 'p4', score1: 11, score2: 5, date: '' };
    const matches = [
      makeMatch('m1', { bracketRound: 2, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { bracketRound: 2, player1Id: 'p3', player2Id: 'p4', games: [playedGame] }),
    ];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m2.player1Id).toBe('p3');
    expect(m2.player2Id).toBe('p4');
  });

  it('leaves matches with a winner untouched during cascade', () => {
    const matches = [
      makeMatch('m1', { bracketRound: 2, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { bracketRound: 2, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
    ];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p1', 'p3');
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m2.player1Id).toBe('p3');
    expect(m2.player2Id).toBe('p4');
  });

  it('cascades into a bye match when displacing a bye player', () => {
    const byeMatch = makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'BYE', winnerId: 'p3' });
    const matches = [
      makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2' }),
      byeMatch,
    ];
    // Swap p1 in m1 for p3 (the bye player) — p3 moves to m1, p1 takes the bye
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p3', 'p2');
    const m1 = result.find(m => m.id === 'm1')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m1.player1Id).toBe('p3');
    expect(m1.player2Id).toBe('p2');
    // p3 was displaced from the bye match, so p1 takes the bye slot
    expect(m2.player1Id).toBe('p1');
    expect(m2.player2Id).toBe('BYE');
    // bye winner updated to the new bye holder
    expect(m2.winnerId).toBe('p1');
  });

  it('updates winnerId on target match when swapping a bye match directly', () => {
    const matches = [
      makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'BYE', winnerId: 'p1' }),
      makeMatch('m2', { bracketRound: 1, player1Id: 'p2', player2Id: 'p3' }),
    ];
    // Click on the bye match and change who gets the bye
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p2', 'BYE');
    const m1 = result.find(m => m.id === 'm1')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m1.player1Id).toBe('p2');
    expect(m1.player2Id).toBe('BYE');
    expect(m1.winnerId).toBe('p2');
    // p1 (displaced from bye) takes p2's slot in m2
    expect(m2.player1Id).toBe('p1');
    expect(m2.player2Id).toBe('p3');
  });

  it('throws when the match is not found', () => {
    expect(() =>
      cascadeBracketPlayerSwap([], 'missing', 'p1', 'p2')
    ).toThrow('Match missing not found');
  });

  it('throws when the match is a round-robin match', () => {
    const matches = [makeMatch('m1', { round: 'roundRobin', bracketRound: 1 })];
    expect(() =>
      cascadeBracketPlayerSwap(matches, 'm1', 'p3', 'p4')
    ).toThrow('Players can only be changed in bracket matches');
  });

  it('throws when the match already has games', () => {
    const playedGame = { id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' };
    const matches = [makeMatch('m1', { games: [playedGame] })];
    expect(() =>
      cascadeBracketPlayerSwap(matches, 'm1', 'p3', 'p4')
    ).toThrow('Cannot change players after games have been played');
  });

  it('throws when the two new players are the same', () => {
    const matches = [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2' })];
    expect(() =>
      cascadeBracketPlayerSwap(matches, 'm1', 'p3', 'p3')
    ).toThrow('Player 1 and Player 2 must be different');
  });

  it('works for R3 (semifinal) matches', () => {
    const matches = [
      makeMatch('m1', { bracketRound: 3, player1Id: 'p1', player2Id: 'p2' }),
      makeMatch('m2', { bracketRound: 3, player1Id: 'p3', player2Id: 'p4' }),
    ];
    const result = cascadeBracketPlayerSwap(matches, 'm1', 'p3', 'p2');
    const m1 = result.find(m => m.id === 'm1')!;
    const m2 = result.find(m => m.id === 'm2')!;
    expect(m1.player1Id).toBe('p3');
    expect(m1.player2Id).toBe('p2');
    // p3 came from m2 so p1 (displaced from m1) takes its slot
    expect(m2.player1Id).toBe('p1');
    expect(m2.player2Id).toBe('p4');
  });
});
