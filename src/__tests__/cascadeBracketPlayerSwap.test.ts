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
