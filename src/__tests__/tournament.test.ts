import { createRoundRobinPairings, advanceBracketRound, createBracketMatches, advanceRoundRobinRound, canEditGameScore } from '../lib/tournament';
import { Tournament, Match, Game } from '../types/pingpong';

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Test Tournament',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }, { matchCount: 2, bestOf: 3 }],
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
    bestOf: 3,
    games: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createRoundRobinPairings
// ─────────────────────────────────────────────────────────────────────────────
describe('createRoundRobinPairings', () => {
  it('creates n/2 matches for an even number of players', () => {
    const matches = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 1);
    expect(matches).toHaveLength(2);
    expect(matches.every(m => m.round === 'roundRobin')).toBe(true);
    expect(matches.every(m => m.bracketRound === 1)).toBe(true);
  });

  it('creates (n-1)/2 real matches plus 1 bye for an odd number of players', () => {
    const matches = createRoundRobinPairings(['p1', 'p2', 'p3'], 't1', 1);
    expect(matches).toHaveLength(2);
    const byeMatch = matches.find(m => m.player2Id === 'BYE');
    expect(byeMatch).toBeDefined();
    expect(byeMatch!.winnerId).toBe(byeMatch!.player1Id);
  });

  it('assigns the correct tournamentId to every match', () => {
    const matches = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 'my-tourney', 2);
    expect(matches.every(m => m.tournamentId === 'my-tourney')).toBe(true);
  });

  it('assigns the correct bracketRound to every match', () => {
    const matches = createRoundRobinPairings(['p1', 'p2', 'p3', 'p4'], 't1', 3);
    expect(matches.every(m => m.bracketRound === 3)).toBe(true);
  });

  it('every match starts with an empty games array', () => {
    const matches = createRoundRobinPairings(['p1', 'p2'], 't1', 1);
    expect(matches.every(m => m.games.length === 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// advanceRoundRobinRound
// ─────────────────────────────────────────────────────────────────────────────
describe('advanceRoundRobinRound', () => {
  it('creates new pairings for the next round when within the limit', () => {
    const tournament = makeTournament({
      roundRobinRounds: 3,
      matches: [
        makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2' }),
        makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p4' }),
      ],
    });
    const newMatches = advanceRoundRobinRound(tournament);
    expect(newMatches.length).toBeGreaterThan(0);
    expect(newMatches.every(m => (m.bracketRound ?? 0) > 1)).toBe(true);
  });

  it('returns empty array when all round-robin rounds are exhausted', () => {
    const tournament = makeTournament({
      roundRobinRounds: 1,
      matches: [
        makeMatch('m1', { round: 'roundRobin', bracketRound: 1 }),
      ],
    });
    const newMatches = advanceRoundRobinRound(tournament);
    expect(newMatches).toHaveLength(0);
  });

  it('top-vs-top strategy pairs top-ranked players together', () => {
    // p1 has 2 wins, p3 has 1 win, p2/p4 have 0 wins
    // Top-vs-top should pair p1 vs p3 (top two) in the next round
    const tournament = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4'],
      roundRobinRounds: 3,
      rrPairingStrategy: 'top-vs-top',
      matches: [
        makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
          games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }] }),
        makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3',
          games: [{ id: 'g2', matchId: 'm2', player1Id: 'p3', player2Id: 'p4', score1: 11, score2: 9, date: '' }] }),
        makeMatch('m3', { round: 'roundRobin', bracketRound: 2, player1Id: 'p1', player2Id: 'p3', winnerId: 'p1',
          games: [{ id: 'g3', matchId: 'm3', player1Id: 'p1', player2Id: 'p3', score1: 11, score2: 7, date: '' }] }),
        makeMatch('m4', { round: 'roundRobin', bracketRound: 2, player1Id: 'p2', player2Id: 'p4', winnerId: 'p2',
          games: [{ id: 'g4', matchId: 'm4', player1Id: 'p2', player2Id: 'p4', score1: 11, score2: 8, date: '' }] }),
      ],
    });
    const newMatches = advanceRoundRobinRound(tournament);
    expect(newMatches.length).toBeGreaterThan(0);
    // The first match should contain p1 (2 wins) and p3 (1 win, higher point diff than p2)
    const firstMatch = newMatches.find(m => m.player2Id !== 'BYE');
    expect(firstMatch).toBeDefined();
    const matchPlayers = [firstMatch!.player1Id, firstMatch!.player2Id];
    expect(matchPlayers).toContain('p1');
    expect(matchPlayers).toContain('p3');
  });

  it('random strategy (default) produces valid pairings', () => {
    const tournament = makeTournament({
      roundRobinRounds: 3,
      matches: [
        makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
        makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
      ],
    });
    const newMatches = advanceRoundRobinRound(tournament);
    expect(newMatches.every(m => m.round === 'roundRobin')).toBe(true);
    expect(newMatches.every(m => m.bracketRound === 2)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBracketMatches
// ─────────────────────────────────────────────────────────────────────────────
describe('createBracketMatches', () => {
  it('creates round-1 bracket matches from 4 players (power of 2 → no byes)', () => {
    const tournament = makeTournament({ matches: [] });
    const matches = createBracketMatches(tournament);
    const round1 = matches.filter(m => m.bracketRound === 1);
    expect(round1).toHaveLength(2);
    expect(matches.every(m => m.round === 'bracket')).toBe(true);
  });

  it('creates a play-in match for an odd number of players', () => {
    const tournament = makeTournament({ players: ['p1', 'p2', 'p3', 'p4', 'p5'], matches: [] });
    const matches = createBracketMatches(tournament);
    const playIn = matches.filter(m => m.bracketRound === 0);
    expect(playIn).toHaveLength(1);
  });

  it('returns empty array when bracket matches already exist', () => {
    const tournament = makeTournament({
      matches: [makeMatch('existing', { round: 'bracket', bracketRound: 1 })],
    });
    const matches = createBracketMatches(tournament);
    expect(matches).toHaveLength(0);
  });

  it('ranks players by round-robin wins before creating brackets', () => {
    const tournament = makeTournament({
      matches: [
        makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
        makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p4' }),
      ],
    });
    createBracketMatches(tournament);
    // Player ranking should be set on the tournament object
    expect(tournament.playerRanking).toBeDefined();
    // p1 and p4 both have 1 win; they should both appear before p2 and p3 (0 wins)
    const top2 = tournament.playerRanking!.slice(0, 2);
    expect(top2).toContain('p1');
    expect(top2).toContain('p4');
  });

  it('uses point differential as tiebreaker when wins are equal', () => {
    // Both p1 and p2 have 1 win, but p1 wins 11-1 (+10 diff) and p2 wins 11-8 (+3 diff)
    const tournament = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4'],
      matches: [
        makeMatch('m1', {
          round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p3', winnerId: 'p1',
          games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p3', score1: 11, score2: 1, date: '' }],
        }),
        makeMatch('m2', {
          round: 'roundRobin', bracketRound: 1, player1Id: 'p2', player2Id: 'p4', winnerId: 'p2',
          games: [{ id: 'g2', matchId: 'm2', player1Id: 'p2', player2Id: 'p4', score1: 11, score2: 8, date: '' }],
        }),
      ],
    });
    createBracketMatches(tournament);
    expect(tournament.playerRanking).toBeDefined();
    // p1 (+10 diff) should rank ahead of p2 (+3 diff), both having 1 win
    expect(tournament.playerRanking![0]).toBe('p1');
    expect(tournament.playerRanking![1]).toBe('p2');
  });

  it('adds bye matches for player counts that are not a power of 2', () => {
    // 6 players → next power of 2 is 8 → 2 bye matches expected
    const tournament = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      matches: [],
    });
    const matches = createBracketMatches(tournament);
    const byeMatches = matches.filter(m => m.player2Id === 'BYE');
    expect(byeMatches).toHaveLength(2);
    expect(byeMatches.every(m => m.winnerId !== undefined)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// advanceBracketRound
// ─────────────────────────────────────────────────────────────────────────────
describe('advanceBracketRound', () => {
  it('returns empty array when there are no bracket matches', () => {
    const tournament = makeTournament({ matches: [] });
    expect(advanceBracketRound(tournament)).toHaveLength(0);
  });

  it('returns empty array when current round is not fully complete', () => {
    const tournament = makeTournament({
      matches: [
        makeMatch('m1', { bracketRound: 1, winnerId: 'p1' }),
        makeMatch('m2', { bracketRound: 1 }), // no winner yet
      ],
    });
    expect(advanceBracketRound(tournament)).toHaveLength(0);
  });

  it('creates next-round matches when current round is complete (4 → 2 players)', () => {
    const tournament = makeTournament({
      bracketRounds: [{ matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
      matches: [
        makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
        makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p4' }),
      ],
    });
    const newMatches = advanceBracketRound(tournament);
    expect(newMatches).toHaveLength(1);
    expect(newMatches[0].bracketRound).toBe(2);
    expect(newMatches[0].bestOf).toBe(5);
    const players = [newMatches[0].player1Id, newMatches[0].player2Id];
    expect(players).toContain('p1');
    expect(players).toContain('p4');
  });

  it('marks tournament as completed when only one winner remains', () => {
    const tournament = makeTournament({
      bracketRounds: [{ matchCount: 1, bestOf: 3 }],
      matches: [
        makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      ],
    });
    const newMatches = advanceBracketRound(tournament);
    expect(newMatches).toHaveLength(0);
    expect(tournament.status).toBe('completed');
  });

  it('uses the configured bestOf for the specific match count (final = matchCount 1)', () => {
    const tournament = makeTournament({
      bracketRounds: [{ matchCount: 1, bestOf: 7 }], // final configured as Bo7
      matches: [
        makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
        makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
      ],
    });
    const newMatches = advanceBracketRound(tournament);
    expect(newMatches[0].bestOf).toBe(7);
  });

  it('excludes play-in matches (bracketRound === 0) from advancement logic', () => {
    const tournament = makeTournament({
      bracketRounds: [{ matchCount: 1, bestOf: 3 }, { matchCount: 2, bestOf: 3 }],
      matches: [
        // play-in — should be ignored
        makeMatch('m0', { bracketRound: 0, player1Id: 'p4', player2Id: 'p5', winnerId: 'p4' }),
        // round 1
        makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
        makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
      ],
    });
    const newMatches = advanceBracketRound(tournament);
    // Should generate round-2 matches from the round-1 winners (p1 and p3), not the play-in winner
    expect(newMatches).toHaveLength(1);
    const players = [newMatches[0].player1Id, newMatches[0].player2Id];
    expect(players).toContain('p1');
    expect(players).toContain('p3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createRoundRobinPairings – re-pair after player removal (bye-duplicate fix)
// ─────────────────────────────────────────────────────────────────────────────
describe('re-pairing after player removal', () => {
  it('does not produce a duplicate player when the removed player had a bye in the current round', () => {
    // Setup: 3 players, round 1 has p1 vs p2 (unplayed) and p3 vs BYE (winnerId set automatically)
    const existingMatches: Match[] = [
      makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2', games: [] }),
      makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'BYE', winnerId: 'p3', games: [] }),
    ];

    // Simulate the "remove p1" handler: drop unplayed current-round matches, keeping only
    // actually-played ones (bye matches with winnerId but no games must also be dropped).
    const currentRound = 1;
    const remainingMatches = existingMatches.filter(m => {
      if (m.round !== 'roundRobin' || (m.bracketRound ?? 1) !== currentRound) return true;
      // Fixed condition: do NOT keep bye matches solely because they have winnerId
      if (m.games.length > 0 || (m.winnerId && m.player2Id !== 'BYE')) return true;
      return false;
    });

    // Re-pair the active players (p1 removed → [p2, p3])
    const newPairings = createRoundRobinPairings(['p2', 'p3'], 't1', currentRound);
    const allMatches = [...remainingMatches, ...newPairings];

    // Collect every player-slot (excluding BYE) and verify no player appears more than once
    const slots = allMatches.flatMap(m => [m.player1Id, m.player2Id]).filter(id => id !== 'BYE');
    const unique = new Set(slots);
    expect(unique.size).toBe(slots.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// activePlayers
// ─────────────────────────────────────────────────────────────────────────────
describe('activePlayers', () => {
  describe('advanceRoundRobinRound', () => {
    it('only pairs activePlayers when the field is set', () => {
      // p4 has been deactivated — should not appear in next round
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3'],
        roundRobinRounds: 3,
        matches: [
          makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2' }),
          makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p4' }),
        ],
      });
      const newMatches = advanceRoundRobinRound(tournament);
      expect(newMatches.length).toBeGreaterThan(0);
      const allPlayerIds = newMatches.flatMap(m => [m.player1Id, m.player2Id]);
      expect(allPlayerIds).not.toContain('p4');
    });

    it('uses all tournament.players when activePlayers is not set', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        roundRobinRounds: 3,
        matches: [
          makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p1', player2Id: 'p2' }),
          makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p4' }),
        ],
      });
      const newMatches = advanceRoundRobinRound(tournament);
      const allPlayerIds = new Set(newMatches.flatMap(m => [m.player1Id, m.player2Id]).filter(id => id !== 'BYE'));
      expect(allPlayerIds.size).toBe(4);
    });
  });

  describe('createBracketMatches', () => {
    it('only seeds activePlayers into the bracket when the field is set', () => {
      // p4 is inactive — bracket should only contain p1, p2, p3
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3'],
        matches: [],
      });
      const matches = createBracketMatches(tournament);
      const allPlayerIds = matches.flatMap(m => [m.player1Id, m.player2Id]).filter(id => id !== 'BYE');
      expect(allPlayerIds).not.toContain('p4');
      // Should be a play-in since 3 is odd
      const playIn = matches.filter(m => m.bracketRound === 0);
      expect(playIn).toHaveLength(1);
    });

    it('still counts wins from inactive players when computing bracket seating', () => {
      // p4 is inactive but won a round-robin match — p4's win should not affect active player ranks
      // p3 has 1 win; p4 (inactive) also has 1 win; only p1/p2/p3 are in the bracket
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3'],
        matches: [
          makeMatch('m1', { round: 'roundRobin', bracketRound: 1, player1Id: 'p3', player2Id: 'p1', winnerId: 'p3' }),
          makeMatch('m2', { round: 'roundRobin', bracketRound: 1, player1Id: 'p4', player2Id: 'p2', winnerId: 'p4' }),
        ],
      });
      createBracketMatches(tournament);
      // p3 has 1 win and is active — should appear in the ranking above p1 and p2 (0 wins)
      expect(tournament.playerRanking).toBeDefined();
      expect(tournament.playerRanking!).toContain('p1');
      expect(tournament.playerRanking!).toContain('p2');
      expect(tournament.playerRanking!).toContain('p3');
      // p4 must not be in the bracket ranking at all
      expect(tournament.playerRanking!).not.toContain('p4');
      expect(tournament.playerRanking![0]).toBe('p3'); // top seed
    });

    it('uses all tournament.players when activePlayers is not set', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        matches: [],
      });
      const matches = createBracketMatches(tournament);
      const allPlayerIds = new Set(
        matches.flatMap(m => [m.player1Id, m.player2Id]).filter(id => id !== 'BYE')
      );
      // All 4 players should appear since no activePlayers restriction
      expect(allPlayerIds.size).toBe(4);
    });

    it('playerRanking only contains activePlayers', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2'],
        matches: [],
      });
      createBracketMatches(tournament);
      expect(tournament.playerRanking).toHaveLength(2);
      expect(tournament.playerRanking).not.toContain('p3');
      expect(tournament.playerRanking).not.toContain('p4');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canEditGameScore
// ─────────────────────────────────────────────────────────────────────────────

function makeGame(id: string, score1: number, score2: number, matchId = 'm1'): Game {
  return { id, matchId, player1Id: 'p1', player2Id: 'p2', score1, score2, date: new Date().toISOString() };
}

describe('canEditGameScore', () => {
  it('returns null for a round-robin match (no restriction)', () => {
    const match = makeMatch('m1', {
      round: 'roundRobin',
      bracketRound: 1,
      games: [makeGame('g1', 11, 5)],
      winnerId: 'p1',
    });
    expect(canEditGameScore([match], 'm1', 'g1', 5, 11)).toBeNull();
  });

  it('returns null when the winner does not change', () => {
    const match = makeMatch('m1', {
      bracketRound: 1,
      bestOf: 3,
      games: [makeGame('g1', 11, 5), makeGame('g2', 11, 3)],
      winnerId: 'p1',
    });
    // Editing g1 to 11-7 still keeps p1 winning 2 games
    expect(canEditGameScore([match], 'm1', 'g1', 11, 7)).toBeNull();
  });

  it('returns null when the winner changes but no subsequent played match exists', () => {
    const match = makeMatch('m1', {
      bracketRound: 1,
      bestOf: 1,
      games: [makeGame('g1', 11, 5)],
      winnerId: 'p1',
    });
    // No other matches at all
    expect(canEditGameScore([match], 'm1', 'g1', 5, 11)).toBeNull();
  });

  it('returns null when the winner changes and subsequent match exists but has no games', () => {
    const r1 = makeMatch('m1', {
      bracketRound: 1,
      bestOf: 1,
      games: [makeGame('g1', 11, 5)],
      winnerId: 'p1',
    });
    const r2 = makeMatch('m2', {
      bracketRound: 2,
      player1Id: 'p1',
      player2Id: 'p3',
      games: [],
    });
    expect(canEditGameScore([r1, r2], 'm1', 'g1', 5, 11)).toBeNull();
  });

  it('returns an error when the winner changes and old winner has played in a subsequent round', () => {
    const r1 = makeMatch('m1', {
      bracketRound: 1,
      bestOf: 1,
      games: [makeGame('g1', 11, 5)],
      winnerId: 'p1',
    });
    const r2 = makeMatch('m2', {
      bracketRound: 2,
      player1Id: 'p1',
      player2Id: 'p3',
      games: [makeGame('g2', 11, 5, 'm2')],
      winnerId: 'p1',
    });
    const result = canEditGameScore([r1, r2], 'm1', 'g1', 5, 11);
    expect(result).not.toBeNull();
    expect(result).toMatch(/subsequent round/i);
  });

  it('returns null when match is not found', () => {
    expect(canEditGameScore([], 'nonexistent', 'g1', 11, 5)).toBeNull();
  });

  it('handles best-of-3: returns error only when the winner changes and old winner has played on', () => {
    // r1: p1 wins 2-1 (g1: p1 win, g2: p2 win, g3: p1 win)
    const r1 = makeMatch('m1', {
      bracketRound: 1,
      bestOf: 3,
      games: [
        makeGame('g1', 11, 5),
        makeGame('g2', 5, 11),
        makeGame('g3', 11, 9),
      ],
      winnerId: 'p1',
    });
    const r2 = makeMatch('m2', {
      bracketRound: 2,
      player1Id: 'p1',
      player2Id: 'p3',
      games: [makeGame('g4', 11, 5, 'm2')],
      winnerId: 'p1',
    });
    // Editing g1 from 11-5 to 11-7: p1 still wins g1, overall winner stays p1 → no block
    expect(canEditGameScore([r1, r2], 'm1', 'g1', 11, 7)).toBeNull();
    // Editing g3 from 11-9 to 9-11: p2 now wins g3, making p2 the 2-win winner → winner changes to p2
    // Old winner (p1) has played in r2 → should be blocked
    expect(canEditGameScore([r1, r2], 'm1', 'g3', 9, 11)).not.toBeNull();
  });
});
