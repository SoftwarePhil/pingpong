import { createRoundRobinPairings, advanceBracketRound, createBracketMatches, advanceRoundRobinRound } from '../lib/tournament';
import { Tournament, Match } from '../types/pingpong';

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

  it('for 9 players with play-in: creates exactly 1 play-in (round 0) + 4 main R1 matches (round 1) with no BYEs in the main first round', () => {
    const tournament = makeTournament({ players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'], matches: [] });
    const matches = createBracketMatches(tournament);
    const playIns = matches.filter(m => m.bracketRound === 0);
    const mainR1 = matches.filter(m => m.bracketRound === 1);
    expect(playIns).toHaveLength(1);
    expect(mainR1).toHaveLength(4);
    // The main R1 should be the first round after play-in, with 8 "players" (7 real + PLAY_IN_WINNER), so no BYE
    const hasByeInMainR1 = mainR1.some(m => m.player1Id === 'BYE' || m.player2Id === 'BYE');
    expect(hasByeInMainR1).toBe(false);
    // One of them should have the PLAY_IN_WINNER
    const hasPlaceholder = mainR1.some(m => m.player1Id === 'PLAY_IN_WINNER' || m.player2Id === 'PLAY_IN_WINNER');
    expect(hasPlaceholder).toBe(true);
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
// advanceBracketRound – positional pairing (regression for wrong-pairing bug)
// ─────────────────────────────────────────────────────────────────────────────
describe('advanceBracketRound – positional pairing', () => {
  /**
   * The bug: winners were re-sorted by playerRanking then re-seeded, which
   * scrambled them.  The fix: winners advance in the order the matches are
   * stored (positional order), and adjacent pairs feed into the next round.
   * match[0].winner vs match[1].winner → next-round match[0]
   * match[2].winner vs match[3].winner → next-round match[1]  … and so on.
   */

  it('pairs winner of match[0] with winner of match[1], not by playerRanking', () => {
    // Scenario from the bug report:
    //   R1 match 0: p1 (seed 1) vs BYE → p1 wins
    //   R1 match 1: p3 (seed 3) vs BYE → p3 wins
    //   R1 match 2: p4 (seed 4) vs p5  → p4 wins
    //   R1 match 3: p2 (seed 2) vs BYE → p2 wins
    //
    // Expected R2:  match 0 → p1 vs p3 (positional pairs 0+1)
    //               match 1 → p4 vs p2 (positional pairs 2+3)
    //
    // Wrong result before fix: winners were re-sorted by seed (p1,p2,p3,p4)
    // then re-seeded, producing p1 vs p4 and p3 vs p2 — wrong halves.
    const tournament = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4', 'p5'],
      playerRanking: ['p1', 'p2', 'p3', 'p4', 'p5'],
      bracketRounds: [{ matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
      matches: [
        makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'BYE',  winnerId: 'p1' }),
        makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'BYE',  winnerId: 'p3' }),
        makeMatch('m3', { bracketRound: 1, player1Id: 'p4', player2Id: 'p5',   winnerId: 'p4' }),
        makeMatch('m4', { bracketRound: 1, player1Id: 'p2', player2Id: 'BYE',  winnerId: 'p2' }),
      ],
    });
    const next = advanceBracketRound(tournament);
    expect(next).toHaveLength(2);

    const players0 = [next[0].player1Id, next[0].player2Id];
    const players1 = [next[1].player1Id, next[1].player2Id];

    // Positional pair 0+1 → p1 and p3
    expect(players0).toContain('p1');
    expect(players0).toContain('p3');

    // Positional pair 2+3 → p4 and p2
    expect(players1).toContain('p4');
    expect(players1).toContain('p2');
  });

  it('preserves bracket halves: seeds 1 and 2 meet only in the final (4-player bracket end-to-end)', () => {
    // Build a standard 4-player bracket using createBracketMatches, then
    // advance through it and verify the final is seed1 vs seed2.
    //
    // createBracketMatches for [p1,p2,p3,p4] with seeding [1,4,3,2]:
    //   after bottom-half reversal the two R1 matches are:
    //     match 0: p1 (seed 1) vs p4 (seed 4)
    //     match 1: p3 (seed 3) vs p2 (seed 2)
    //
    // For the final to be seed1 vs seed2 we need:
    //   winner(match0) vs winner(match1)
    // i.e. positional order, NOT a re-seeding of [p1,p2] back to [1 vs 2].

    // Give all players 0 wins so ranking is insertion order: p1 > p2 > p3 > p4
    const tournament = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4'],
      bracketRounds: [{ matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
      matches: [],
    });
    const r1Matches = createBracketMatches(tournament);
    expect(r1Matches).toHaveLength(2);

    // p1 wins match 0, p2 wins match 1 (the best case for a seeds-1-vs-2 final)
    const completedR1 = r1Matches.map(m => ({
      ...m,
      winnerId: m.player1Id === 'p1' || m.player2Id === 'p1' ? 'p1'
              : m.player1Id === 'p2' || m.player2Id === 'p2' ? 'p2'
              : m.player1Id, // fallback: player1 wins
    }));
    tournament.matches = [...completedR1];

    const finalMatches = advanceBracketRound(tournament);
    expect(finalMatches).toHaveLength(1);
    const finalists = [finalMatches[0].player1Id, finalMatches[0].player2Id];
    expect(finalists).toContain('p1');
    expect(finalists).toContain('p2');
  });

  it('8-player bracket R1→R2: each next-round match pairs winners from the correct positional pair', () => {
    // 8 players, R1 has 4 matches.  Each player at position i wins their R1 match.
    // After advancement:
    //   R2 match 0 → winner[0] vs winner[1]
    //   R2 match 1 → winner[2] vs winner[3]
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const tournament = makeTournament({
      players,
      playerRanking: players,
      bracketRounds: [{ matchCount: 4, bestOf: 3 }, { matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
      matches: [
        makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p8', winnerId: 'p1' }),
        makeMatch('m2', { bracketRound: 1, player1Id: 'p4', player2Id: 'p5', winnerId: 'p4' }),
        makeMatch('m3', { bracketRound: 1, player1Id: 'p2', player2Id: 'p7', winnerId: 'p2' }),
        makeMatch('m4', { bracketRound: 1, player1Id: 'p3', player2Id: 'p6', winnerId: 'p3' }),
      ],
    });

    const r2 = advanceBracketRound(tournament);
    expect(r2).toHaveLength(2);

    // Positional pair 0+1: p1 and p4
    expect([r2[0].player1Id, r2[0].player2Id]).toContain('p1');
    expect([r2[0].player1Id, r2[0].player2Id]).toContain('p4');

    // Positional pair 2+3: p2 and p3
    expect([r2[1].player1Id, r2[1].player2Id]).toContain('p2');
    expect([r2[1].player1Id, r2[1].player2Id]).toContain('p3');
  });

  it('does NOT re-sort winners by playerRanking when positional order differs from seed order', () => {
    // playerRanking says p1 > p2 > p3 > p4, but both top seeds are upset in R1.
    // Old (buggy) code re-sorted winners back to seed order [p1,p2,...] then re-seeded.
    // Correct code keeps positional order: match[0] winner (p3) vs match[1] winner (p4).
    const t = makeTournament({
      players: ['p1', 'p2', 'p3', 'p4'],
      playerRanking: ['p1', 'p2', 'p3', 'p4'],
      bracketRounds: [{ matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
      matches: [
        // match[0] winner → p3 (upsets p1)
        makeMatch('m1', { bracketRound: 1, player1Id: 'p3', player2Id: 'p1', winnerId: 'p3' }),
        // match[1] winner → p4 (upsets p2)
        makeMatch('m2', { bracketRound: 1, player1Id: 'p4', player2Id: 'p2', winnerId: 'p4' }),
      ],
    });
    const next = advanceBracketRound(t);
    expect(next).toHaveLength(1);
    // Positional pair 0+1 → p3 and p4 (actual winners), NOT p1 and p2 (the seeded players)
    const finalists = [next[0].player1Id, next[0].player2Id];
    expect(finalists).toContain('p3');
    expect(finalists).toContain('p4');
    expect(finalists).not.toContain('p1');
    expect(finalists).not.toContain('p2');
  });

  it('all next-round matches are assigned bracketRound = currentRound + 1', () => {
    const tournament = makeTournament({
      bracketRounds: [{ matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
      matches: [
        makeMatch('m1', { bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
        makeMatch('m2', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3' }),
      ],
    });
    const next = advanceBracketRound(tournament);
    expect(next.every(m => m.bracketRound === 2)).toBe(true);
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
      // Should be a play-in (round 0) since 3 active is odd
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
