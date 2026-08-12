import {
  calculateTournamentPoints,
  getTournamentPlacements,
  validateTournamentPointValues,
} from '../lib/tournamentPoints';
import { Match, Tournament } from '../types/pingpong';

function makeTournament(id: string, startDate: string, overrides: Partial<Tournament> = {}): Tournament {
  return {
    id,
    name: id,
    startDate,
    status: 'completed',
    roundRobinRounds: 1,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 1 }, { matchCount: 2, bestOf: 1 }],
    players: ['p1', 'p2', 'p3', 'p4'],
    matches: [],
    ...overrides,
  };
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

describe('getTournamentPlacements', () => {
  it('extracts first, second, and third from a completed bracket', () => {
    const tournament = makeTournament('t1', '2026-01-01T12:00:00.000Z', {
      matches: [
        makeMatch('semi-1', { player1Id: 'p1', player2Id: 'p4', winnerId: 'p1' }),
        makeMatch('semi-2', { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2' }),
        makeMatch('final', { bracketRound: 2, player1Id: 'p1', player2Id: 'p2', winnerId: 'p2' }),
        makeMatch('third', { bracketRound: 2, player1Id: 'p4', player2Id: 'p3', winnerId: 'p3', isThirdPlace: true }),
      ],
    });

    expect(getTournamentPlacements(tournament)).toEqual({
      firstPlaceId: 'p2',
      secondPlaceId: 'p1',
      thirdPlaceIds: ['p3'],
    });
  });

  it('treats both semifinal losers as shared third when no third-place match exists', () => {
    const tournament = makeTournament('t1', '2026-01-01T12:00:00.000Z', {
      matches: [
        makeMatch('semi-1', { player1Id: 'p1', player2Id: 'p4', winnerId: 'p1' }),
        makeMatch('semi-2', { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2' }),
        makeMatch('final', { bracketRound: 2, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      ],
    });

    expect(getTournamentPlacements(tournament)).toEqual({
      firstPlaceId: 'p1',
      secondPlaceId: 'p2',
      thirdPlaceIds: ['p4', 'p3'],
    });
  });

  it('does not award third-place points before an explicit third-place match is complete', () => {
    const tournament = makeTournament('t1', '2026-01-01T12:00:00.000Z', {
      matches: [
        makeMatch('semi-1', { player1Id: 'p1', player2Id: 'p4', winnerId: 'p1' }),
        makeMatch('semi-2', { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2' }),
        makeMatch('final', { bracketRound: 2, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
        makeMatch('third', { bracketRound: 2, player1Id: 'p4', player2Id: 'p3', isThirdPlace: true }),
      ],
    });

    expect(getTournamentPlacements(tournament)).toEqual({
      firstPlaceId: 'p1',
      secondPlaceId: 'p2',
      thirdPlaceIds: [],
    });
  });

  it('falls back to the saved ranking when the tournament has no bracket', () => {
    const tournament = makeTournament('t1', '2026-01-01T12:00:00.000Z', {
      matches: [],
      playerRanking: ['p3', 'p1', 'p4', 'p2'],
    });

    expect(getTournamentPlacements(tournament)).toEqual({
      firstPlaceId: 'p3',
      secondPlaceId: 'p1',
      thirdPlaceIds: ['p4'],
    });
  });
});

describe('calculateTournamentPoints', () => {
  it('sums custom placement points and doubles only the latest tournament', () => {
    const older = makeTournament('older', '2026-01-01T12:00:00.000Z', {
      matches: [makeMatch('final-old', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' })],
    });
    const latest = makeTournament('latest', '2026-02-01T12:00:00.000Z', {
      matches: [makeMatch('final-latest', { bracketRound: 1, player1Id: 'p2', player2Id: 'p1', winnerId: 'p2' })],
    });

    const result = calculateTournamentPoints(
      [latest, older],
      { firstPlacePoints: 5, secondPlacePoints: 3, thirdPlacePoints: 1 },
      true,
    );

    expect(result.winnerId).toBe('p2');
    expect(result.leaderboard.slice(0, 2)).toEqual([
      expect.objectContaining({ playerId: 'p2', totalPoints: 13, firstPlaces: 1, secondPlaces: 1 }),
      expect.objectContaining({ playerId: 'p1', totalPoints: 11, firstPlaces: 1, secondPlaces: 1 }),
    ]);
    expect(result.tournamentResults.map(tournament => tournament.multiplier)).toEqual([1, 2]);
  });

  it('uses first-place count to break equal point totals', () => {
    const first = makeTournament('first', '2026-01-01T12:00:00.000Z', {
      matches: [makeMatch('final-1', { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' })],
    });
    const second = makeTournament('second', '2026-02-01T12:00:00.000Z', {
      matches: [
        makeMatch('semi-1', { player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
        makeMatch('semi-2', { player1Id: 'p2', player2Id: 'p1', winnerId: 'p2' }),
        makeMatch('final-2', { bracketRound: 2, player1Id: 'p3', player2Id: 'p2', winnerId: 'p3' }),
        makeMatch('third-2', { bracketRound: 2, player1Id: 'p4', player2Id: 'p1', winnerId: 'p1', isThirdPlace: true }),
      ],
    });

    const result = calculateTournamentPoints([first, second]);

    expect(result.leaderboard.slice(0, 2).map(entry => entry.playerId)).toEqual(['p1', 'p2']);
    expect(result.leaderboard.slice(0, 2).map(entry => entry.totalPoints)).toEqual([4, 4]);
  });
});

describe('validateTournamentPointValues', () => {
  it('requires strictly decreasing positive values', () => {
    expect(validateTournamentPointValues({ firstPlacePoints: 3, secondPlacePoints: 2, thirdPlacePoints: 1 })).toBeNull();
    expect(validateTournamentPointValues({ firstPlacePoints: 2, secondPlacePoints: 2, thirdPlacePoints: 1 })).not.toBeNull();
    expect(validateTournamentPointValues({ firstPlacePoints: 3, secondPlacePoints: 0, thirdPlacePoints: 1 })).not.toBeNull();
  });
});
