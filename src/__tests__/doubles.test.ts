import { createBracketMatches, createRoundRobinPairings, resyncRoundRobinMatches, setRoundRobinFormat } from '../lib/tournament';
import { getMatchSides, getWinningSide, isMatchComplete } from '../lib/matchFormat';
import { getRoundRobinStandings } from '../lib/standings';
import { computeStats } from '../lib/stats';
import { Player, Tournament } from '../types/pingpong';

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Doubles',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 3,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
    players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    activePlayers: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    matches: [],
    ...overrides,
  };
}

function player(id: string): Player {
  return { id, name: id, tournamentIds: [] };
}

describe('2v2 round-robin support', () => {
  it('creates balanced two-player sides for each group of four', () => {
    const [match] = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1, 1, 'doubles');

    expect(getMatchSides(match)).toEqual([['p1', 'p4'], ['p2', 'p3']]);
    expect(match.player1Id).toBe('p1');
    expect(match.player2Id).toBe('p2');
  });

  it('creates one doubles match per four active players', () => {
    const matches = createRoundRobinPairings(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      't1',
      2,
      3,
      'doubles',
    );
    expect(matches).toHaveLength(2);
    expect(new Set(matches.flatMap(match => getMatchSides(match).flat()))).toEqual(
      new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']),
    );
  });

  it('rejects an invalid doubles roster', () => {
    expect(() => createRoundRobinPairings(['p1', 'p2', 'p3'], 't1', 1, 1, 'doubles'))
      .toThrow(/at least four active players/i);
    expect(() => createRoundRobinPairings(['p1', 'p2', 'p3', 'p4', 'p4', 'p5', 'p6', 'p7'], 't1', 1, 1, 'doubles'))
      .toThrow(/at least four active players/i);
  });

  it('converts an unplayed current round and can convert it back', () => {
    const tournament = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4'],
      activePlayers: ['p1', 'p2', 'p3', 'p4'],
      matches: createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1),
    });
    const originalIds = tournament.matches!.map(match => match.id);

    const converted = setRoundRobinFormat(tournament, 'doubles');
    expect(converted.removedMatchIds).toEqual(originalIds);
    expect(tournament.roundRobinFormats).toEqual({ 1: 'doubles' });
    expect(tournament.matches).toHaveLength(1);
    expect(tournament.matches![0].side1PlayerIds).toHaveLength(2);

    setRoundRobinFormat(tournament, 'singles');
    expect(tournament.roundRobinFormats).toBeUndefined();
    expect(tournament.matches![0].side1PlayerIds).toBeUndefined();
  });

  it('does not convert a round after a game has been recorded', () => {
    const [match] = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1);
    match.games.push({ id: 'g1', matchId: match.id, player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' });
    const tournament = makeTournament({ matches: [match] });

    expect(() => setRoundRobinFormat(tournament, 'doubles'))
      .toThrow(/after a game has been played/i);
  });

  it('resyncs an unplayed doubles round without duplicating players', () => {
    const tournament = makeTournament({
      roundRobinFormats: { 1: 'doubles' },
      matches: createRoundRobinPairings(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], 't1', 1, 1, 'doubles'),
    });
    const result = resyncRoundRobinMatches(tournament);
    const players = result.addedMatches.flatMap(match => getMatchSides(match).flat());

    expect(result.addedMatches).toHaveLength(2);
    expect(new Set(players).size).toBe(8);
    expect(players.sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    expect(result.removedMatchIds).toHaveLength(2);
  });

  it('keeps locked doubles players fixed while resyncing the remaining pool', () => {
    const matches = createRoundRobinPairings(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      't1',
      1,
      1,
      'doubles',
    );
    const locked = matches[0];
    locked.games = [{
      id: 'g1', matchId: locked.id, player1Id: locked.player1Id, player2Id: locked.player2Id,
      side1PlayerIds: locked.side1PlayerIds, side2PlayerIds: locked.side2PlayerIds,
      score1: 11, score2: 7, date: '',
    }];
    locked.winnerSide = 1;
    const tournament = makeTournament({ matches, roundRobinFormats: { 1: 'doubles' } });

    const result = resyncRoundRobinMatches(tournament);
    expect(result.matches).toContain(locked);
    expect(result.addedMatches).toHaveLength(1);
    const allPlayedPlayers = new Set([
      ...getMatchSides(locked).flat(),
      ...result.addedMatches.flatMap(match => getMatchSides(match).flat()),
    ]);
    expect(allPlayedPlayers.size).toBe(8);
    expect(getMatchSides(result.addedMatches[0]).flat().every(id => !getMatchSides(locked).flat().includes(id))).toBe(true);
  });

  it('credits a doubles result to every player on each side', () => {
    const [match] = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1);
    match.side1PlayerIds = ['p1', 'p4'];
    match.side2PlayerIds = ['p2', 'p3'];
    match.games = [
      {
        id: 'g1', matchId: match.id, player1Id: 'p1', player2Id: 'p2',
        side1PlayerIds: ['p1', 'p4'], side2PlayerIds: ['p2', 'p3'],
        score1: 11, score2: 7, date: '',
      },
    ];
    match.winnerSide = 1;

    expect(getWinningSide(match)).toBe(1);
    expect(isMatchComplete(match)).toBe(true);
    const standings = getRoundRobinStandings(['p1', 'p2', 'p3', 'p4'], [match]);
    expect(standings.p1).toMatchObject({ wins: 1, losses: 0, played: 1, gamesPlayed: 1, pointDiff: 4 });
    expect(standings.p4).toMatchObject({ wins: 1, losses: 0, played: 1, gamesPlayed: 1, pointDiff: 4 });
    expect(standings.p2).toMatchObject({ wins: 0, losses: 1, played: 1, gamesPlayed: 1, pointDiff: -4 });
    expect(standings.p3).toMatchObject({ wins: 0, losses: 1, played: 1, gamesPlayed: 1, pointDiff: -4 });

    const stats = computeStats(['p1', 'p2', 'p3', 'p4'].map(player), match.games);
    expect(stats.find(stat => stat.id === 'p1')).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, totalPoints: 11 });
    expect(stats.find(stat => stat.id === 'p4')).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0, totalPoints: 11 });
  });

  it('uses individual doubles results when seeding the singles bracket', () => {
    const [match] = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1, 1, 'doubles');
    match.games = [{
      id: 'g1', matchId: match.id, player1Id: match.player1Id, player2Id: match.player2Id,
      side1PlayerIds: match.side1PlayerIds, side2PlayerIds: match.side2PlayerIds,
      score1: 11, score2: 5, date: '',
    }];
    match.winnerSide = 1;
    const tournament = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4'],
      activePlayers: ['p1', 'p2', 'p3', 'p4'],
      matches: [match],
    });

    createBracketMatches(tournament);
    expect(tournament.playerRanking?.slice(0, 2)).toEqual(['p1', 'p4']);
  });
});
