import {
  buildBracketFromPreview,
  cascadeBracketPlayerSwap,
  createBracketMatches,
  InvalidBracketError,
  PLAY_IN_WINNER_PLACEHOLDER,
} from '../lib/tournament';
import { PlayInMode, Tournament } from '../types/pingpong';

function makeTournament(playerCount: number, playInMode: PlayInMode = 'auto'): Tournament {
  const players = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  return {
    id: 't1',
    name: 'T1',
    startDate: '2026-10-01T00:00:00.000Z',
    status: 'roundRobin',
    roundRobinRounds: 1,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
    players,
    activePlayers: players,
    matches: [],
    bracketConfig: { playInMode },
  };
}

const slot = (bracketRound: 0 | 1, player1Id: string, player2Id: string) => ({ bracketRound, player1Id, player2Id });

function expectInvalid(tournament: Tournament, submitted: unknown, message: string) {
  expect(() => buildBracketFromPreview(tournament, submitted)).toThrow(InvalidBracketError);
  expect(() => buildBracketFromPreview(tournament, submitted)).toThrow(message);
}

describe('buildBracketFromPreview', () => {
  it('accepts every opening bracket the generator produces', () => {
    const cases: [number, PlayInMode][] = [[2, 'auto'], [2, 'none']];
    for (let count = 3; count <= 12; count++) {
      for (const mode of ['auto', 'force', 'none'] as PlayInMode[]) cases.push([count, mode]);
    }
    for (const [count, mode] of cases) {
      const tournament = makeTournament(count, mode);
      const generated = createBracketMatches({ ...tournament, matches: [] });
      const rebuilt = buildBracketFromPreview(tournament, generated);
      expect(rebuilt.map(m => [m.bracketRound, m.player1Id, m.player2Id, m.winnerId, m.bestOf]))
        .toEqual(generated.map(m => [m.bracketRound, m.player1Id, m.player2Id, m.winnerId, m.bestOf]));
    }
  });

  it('accepts a preview after players were swapped between matches', () => {
    const tournament = makeTournament(8);
    const generated = createBracketMatches({ ...tournament, matches: [] });
    const [first, second] = generated;
    const swapped = cascadeBracketPlayerSwap(generated, first.id, second.player1Id, first.player2Id);
    expect(() => buildBracketFromPreview(tournament, swapped)).not.toThrow();
  });

  it('rebuilds matches from trusted data, keeping only round, players and order', () => {
    const tournament = makeTournament(5);
    const submitted = [
      { ...slot(0, 'p4', 'p5'), id: 'client-id', tournamentId: 'other', bestOf: 99, games: [{ id: 'g' }], winnerId: 'p4' },
      slot(1, 'p1', PLAY_IN_WINNER_PLACEHOLDER),
      slot(1, 'p2', 'p3'),
    ];

    const matches = buildBracketFromPreview(tournament, submitted);

    expect(matches.map(m => [m.bracketRound, m.player1Id, m.player2Id])).toEqual([
      [0, 'p4', 'p5'],
      [1, 'p1', PLAY_IN_WINNER_PLACEHOLDER],
      [1, 'p2', 'p3'],
    ]);
    for (const match of matches) {
      expect(match.id).not.toBe('client-id');
      expect(match.tournamentId).toBe('t1');
      expect(match.round).toBe('bracket');
      expect(match.games).toEqual([]);
      expect(match.winnerId).toBeUndefined();
    }
    expect(matches.map(m => m.bestOf)).toEqual([1, 3, 3]);
    expect(new Set(matches.map(m => m.id)).size).toBe(3);
  });

  it('gives a bye an automatic winner and a single game', () => {
    const matches = buildBracketFromPreview(makeTournament(3, 'none'), [slot(1, 'p1', 'BYE'), slot(1, 'p2', 'p3')]);
    expect(matches[0]).toMatchObject({ winnerId: 'p1', bestOf: 1 });
    expect(matches[1].bestOf).toBe(3);
    expect(matches[1]).not.toHaveProperty('winnerId');
  });

  describe('rejects', () => {
    const tournament = makeTournament(4);
    const valid = [slot(1, 'p1', 'p2'), slot(1, 'p3', 'p4')];

    it('a missing or empty submission', () => {
      expectInvalid(tournament, undefined, 'no matches');
      expectInvalid(tournament, [], 'no matches');
    });

    it('malformed matches', () => {
      expectInvalid(tournament, [...valid, null], 'two player ids');
      expectInvalid(tournament, [slot(1, 'p1', 'p2'), { bracketRound: 1, player1Id: 'p3', player2Id: 4 }], 'two player ids');
      expectInvalid(tournament, [slot(1, 'p1', 'p2'), { ...slot(1, 'p3', 'p4'), bracketRound: 2 }], 'round of 0 or 1');
    });

    it('a first round that cannot pair up evenly', () => {
      expectInvalid(makeTournament(6, 'none'), [slot(1, 'p1', 'p2'), slot(1, 'p3', 'p4'), slot(1, 'p5', 'p6')], '1, 2, 4, 8');
    });

    it('players who are not active in the tournament', () => {
      expectInvalid(tournament, [slot(1, 'p1', 'p2'), slot(1, 'p3', 'intruder')], 'Not an active player in this tournament: intruder');
      expectInvalid({ ...tournament, activePlayers: ['p1', 'p2', 'p3'] }, valid, 'Not an active player in this tournament: p4');
    });

    it('a player placed twice', () => {
      expectInvalid(tournament, [slot(1, 'p1', 'p2'), slot(1, 'p1', 'p4')], 'more than one bracket slot');
      expectInvalid(makeTournament(3), [slot(0, 'p2', 'p3'), slot(1, 'p1', 'p2')], 'more than one bracket slot');
    });

    it('an active player left out', () => {
      expectInvalid(makeTournament(5, 'none'), [slot(1, 'p1', 'p2'), slot(1, 'p3', 'p4')], 'Every active player');
    });

    it('play-in winners that do not feed exactly one slot', () => {
      expectInvalid(makeTournament(3), [slot(0, 'p2', 'p3'), slot(1, 'p1', 'BYE')], 'exactly one first-round slot');
      expectInvalid(makeTournament(3), [slot(1, 'p1', PLAY_IN_WINNER_PLACEHOLDER), slot(1, 'p2', 'p3')], 'exactly one first-round slot');
      expectInvalid(
        makeTournament(4),
        [slot(0, 'p3', 'p4'), slot(1, 'p1', PLAY_IN_WINNER_PLACEHOLDER), slot(1, 'p2', PLAY_IN_WINNER_PLACEHOLDER)],
        'exactly one first-round slot',
      );
    });

    it('a bye that is not paired with an active player', () => {
      expectInvalid(makeTournament(2), [slot(1, 'BYE', 'BYE'), slot(1, 'p1', 'p2')], 'bye must be paired');
      expectInvalid(makeTournament(3), [slot(0, 'p2', 'p3'), slot(1, PLAY_IN_WINNER_PLACEHOLDER, 'BYE'), slot(1, 'p1', 'BYE')], 'bye must be paired');
    });
  });
});
