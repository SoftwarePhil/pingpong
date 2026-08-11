import { cascadeBracketOutcomeChange, TBD_PLACEHOLDER } from '../lib/tournament';
import { Match, Game } from '../types/pingpong';

function makeGame(score1: number, score2: number, overrides: Partial<Game> = {}): Game {
  return { id: `g${Math.random()}`, player1Id: 'p1', player2Id: 'p2', score1, score2, date: new Date().toISOString(), ...overrides };
}

function makeMatch(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    tournamentId: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
    round: 'bracket',
    bracketRound: 1,
    bestOf: 1,
    games: [],
    ...overrides,
  };
}

describe('cascadeBracketOutcomeChange', () => {
  it('does nothing when the next round has not been created yet', () => {
    const matches = [
      makeMatch('r1a', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', games: [makeGame(11, 5)] }),
    ];
    const { matches: result, invalidatedGameIds } = cascadeBracketOutcomeChange(matches, 'r1a');
    expect(result).toEqual(matches);
    expect(invalidatedGameIds).toEqual([]);
  });

  it('propagates a changed winner into the next round slot when the next match is unplayed', () => {
    const matches = [
      makeMatch('r1a', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p2', games: [makeGame(5, 11)] }),
      makeMatch('r1b', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3', games: [makeGame(11, 3)] }),
      makeMatch('r2a', { bracketRound: 2, player1Id: 'p1', player2Id: 'p3', games: [] }),
    ];
    // Correction: r1a's winner is actually p1, not p2
    const corrected = matches.map(m => m.id === 'r1a' ? { ...m, winnerId: 'p1', games: [makeGame(11, 5)] } : m);
    const { matches: result, invalidatedGameIds } = cascadeBracketOutcomeChange(corrected, 'r1a');
    const r2 = result.find(m => m.id === 'r2a')!;
    expect(r2.player1Id).toBe('p1');
    expect(r2.player2Id).toBe('p3');
    expect(invalidatedGameIds).toEqual([]);
  });

  it('slots into player2 when the source match is in an odd position within its round', () => {
    const matches = [
      makeMatch('r1a', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      makeMatch('r1b', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p4' }),
      makeMatch('r2a', { bracketRound: 2, player1Id: 'p1', player2Id: 'p4' }),
    ];
    const corrected = matches.map(m => m.id === 'r1b' ? { ...m, winnerId: 'p3' } : m);
    const { matches: result } = cascadeBracketOutcomeChange(corrected, 'r1b');
    const r2 = result.find(m => m.id === 'r2a')!;
    expect(r2.player1Id).toBe('p1');
    expect(r2.player2Id).toBe('p3');
  });

  it('clears stale games and winner on a next-round match that was already played against the wrong participant, and keeps cascading', () => {
    const matches = [
      makeMatch('r1a', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p2', games: [makeGame(5, 11)] }),
      makeMatch('r1b', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3', games: [makeGame(11, 3)] }),
      makeMatch('r2a', {
        bracketRound: 2, player1Id: 'p2', player2Id: 'p3', winnerId: 'p2',
        games: [makeGame(11, 7, { player1Id: 'p2', player2Id: 'p3' })],
      }),
      makeMatch('r3final', { bracketRound: 3, player1Id: 'p2', player2Id: 'TBD_OTHER' }),
    ];
    // Correction: r1a's real winner is p1, not p2
    const corrected = matches.map(m => m.id === 'r1a' ? { ...m, winnerId: 'p1', games: [makeGame(11, 5)] } : m);
    const { matches: result, invalidatedGameIds } = cascadeBracketOutcomeChange(corrected, 'r1a');

    const r2 = result.find(m => m.id === 'r2a')!;
    expect(r2.player1Id).toBe('p1');
    expect(r2.games).toEqual([]);
    expect(r2.winnerId).toBeUndefined();
    expect(invalidatedGameIds).toHaveLength(1);

    // Cascade continues to the final since r2a's outcome is now undetermined
    const final = result.find(m => m.id === 'r3final')!;
    expect(final.player1Id).toBe(TBD_PLACEHOLDER);
  });

  it('stops cascading once a downstream slot is already consistent', () => {
    const matches = [
      makeMatch('r1a', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      makeMatch('r2a', { bracketRound: 2, player1Id: 'p1', player2Id: 'p9' }),
    ];
    const { matches: result } = cascadeBracketOutcomeChange(matches, 'r1a');
    expect(result).toEqual(matches);
  });

  it('ignores play-in matches (bracketRound 0)', () => {
    const matches = [
      makeMatch('playin', { bracketRound: 0, player1Id: 'p1', player2Id: 'p2', winnerId: 'p2' }),
      makeMatch('r1a', { bracketRound: 1, player1Id: 'PLAY_IN_WINNER', player2Id: 'p3' }),
    ];
    const { matches: result } = cascadeBracketOutcomeChange(matches, 'playin');
    expect(result).toEqual(matches);
  });

  it('updates the third-place slot when a semifinal winner changes', () => {
    const matches = [
      makeMatch('semi-a', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      makeMatch('semi-b', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
      makeMatch('final', { bracketRound: 2, player1Id: 'p1', player2Id: 'p3' }),
      makeMatch('third', { bracketRound: 2, player1Id: 'p2', player2Id: 'p4', isThirdPlace: true }),
    ];

    const corrected = matches.map(m => m.id === 'semi-a' ? { ...m, winnerId: 'p2' } : m);
    const { matches: result } = cascadeBracketOutcomeChange(corrected, 'semi-a');
    const final = result.find(m => m.id === 'final')!;
    const third = result.find(m => m.id === 'third')!;

    expect([final.player1Id, final.player2Id]).toEqual(['p2', 'p3']);
    expect([third.player1Id, third.player2Id]).toEqual(['p1', 'p4']);
  });

  it('does not mutate the input array', () => {
    const matches = [
      makeMatch('r1a', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p2' }),
      makeMatch('r2a', { bracketRound: 2, player1Id: 'p2', player2Id: 'p9' }),
    ];
    const snapshot = JSON.parse(JSON.stringify(matches));
    cascadeBracketOutcomeChange(matches, 'r1a');
    expect(matches).toEqual(snapshot);
  });
});
