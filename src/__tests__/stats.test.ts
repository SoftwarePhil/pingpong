import { computeStats } from '../lib/stats';
import { Player, Game } from '../types/pingpong';

function makePlayer(id: string, name: string): Player {
  return { id, name, tournamentIds: [] };
}

function makeGame(id: string, p1Id: string, p2Id: string, score1: number, score2: number): Game {
  return { id, player1Id: p1Id, player2Id: p2Id, score1, score2, date: new Date().toISOString() };
}

describe('computeStats', () => {
  it('returns empty array when there are no players', () => {
    expect(computeStats([], [])).toEqual([]);
  });

  it('returns zero stats for a player with no games', () => {
    const players = [makePlayer('p1', 'Alice')];
    const stats = computeStats(players, []);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      id: 'p1',
      name: 'Alice',
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPoints: 0,
      avgPointsPerGame: 0,
    });
  });

  it('counts wins, losses and points correctly', () => {
    const players = [makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')];
    const games = [
      makeGame('g1', 'p1', 'p2', 11, 5), // p1 wins
      makeGame('g2', 'p1', 'p2', 8, 11), // p2 wins
      makeGame('g3', 'p1', 'p2', 11, 9), // p1 wins
    ];
    const stats = computeStats(players, games);
    const alice = stats.find(s => s.id === 'p1')!;
    const bob = stats.find(s => s.id === 'p2')!;

    expect(alice.gamesPlayed).toBe(3);
    expect(alice.wins).toBe(2);
    expect(alice.losses).toBe(1);
    expect(alice.totalPoints).toBe(30);

    expect(bob.gamesPlayed).toBe(3);
    expect(bob.wins).toBe(1);
    expect(bob.losses).toBe(2);
    expect(bob.totalPoints).toBe(25);
  });

  it('calculates winRate as a rounded percentage', () => {
    const players = [makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')];
    const games = [
      makeGame('g1', 'p1', 'p2', 11, 5),
      makeGame('g2', 'p1', 'p2', 11, 8),
      makeGame('g3', 'p1', 'p2', 5, 11),
    ];
    const stats = computeStats(players, games);
    const alice = stats.find(s => s.id === 'p1')!;
    // 2 wins out of 3 games = 66.67% → rounds to 67
    expect(alice.winRate).toBe(67);
  });

  it('calculates avgPointsPerGame as a rounded integer', () => {
    const players = [makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')];
    const games = [
      makeGame('g1', 'p1', 'p2', 11, 5),
      makeGame('g2', 'p1', 'p2', 13, 11),
    ];
    const stats = computeStats(players, games);
    const alice = stats.find(s => s.id === 'p1')!;
    // (11 + 13) / 2 = 12
    expect(alice.avgPointsPerGame).toBe(12);
  });

  it('sorts results by winRate descending, then wins descending', () => {
    const players = [
      makePlayer('p1', 'Alice'),
      makePlayer('p2', 'Bob'),
      makePlayer('p3', 'Carol'),
    ];
    // Alice: 2/2 = 100%, Bob: 0/2 = 0%, Carol: 1/2 = 50%
    const games = [
      makeGame('g1', 'p1', 'p2', 11, 5),
      makeGame('g2', 'p1', 'p2', 11, 8),
      makeGame('g3', 'p3', 'p2', 11, 3),
      makeGame('g4', 'p3', 'p2', 5, 11),
    ];
    const stats = computeStats(players, games);
    expect(stats.map(s => s.id)).toEqual(['p1', 'p3', 'p2']);
  });

  it('skips games involving unknown player IDs (e.g. BYE)', () => {
    const players = [makePlayer('p1', 'Alice')];
    const games = [makeGame('g1', 'p1', 'BYE', 11, 0)];
    const stats = computeStats(players, games);
    // BYE is not in the statsMap, so game is skipped
    expect(stats[0].gamesPlayed).toBe(0);
  });
});
