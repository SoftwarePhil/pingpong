import { resyncRoundRobinMatches } from '../lib/tournament';
import { Tournament, Match } from '../types/pingpong';

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1',
    name: 'Test Tournament',
    startDate: new Date().toISOString(),
    status: 'roundRobin',
    roundRobinRounds: 3,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
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
    round: 'roundRobin',
    bracketRound: 1,
    bestOf: 1,
    games: [],
    ...overrides,
  };
}

/** Every non-BYE player id appearing across the given matches, with counts, for duplicate detection. */
function slotCounts(matches: Match[]): Record<string, number> {
  const counts: Record<string, number> = {};
  matches.flatMap(m => [m.player1Id, m.player2Id])
    .filter(id => id !== 'BYE')
    .forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  return counts;
}

describe('resyncRoundRobinMatches', () => {
  // ───────────────────────────────────────────────────────────────────────
  // Adding players
  // ───────────────────────────────────────────────────────────────────────
  describe('adding players', () => {
    it('pairs two newly added players together, leaving the already-played match untouched', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2'],
        activePlayers: ['p1', 'p2', 'p3', 'p4'], // p3/p4 just added by the caller
        matches: [
          makeMatch('m1', {
            player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
        ],
      });

      const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds).toHaveLength(0);
      expect(addedMatches).toHaveLength(1);
      const [added] = addedMatches;
      expect([added.player1Id, added.player2Id].sort()).toEqual(['p3', 'p4']);

      // The already-played match must be present, unmodified
      const kept = matches.find(m => m.id === 'm1')!;
      expect(kept.winnerId).toBe('p1');
      expect(kept.games).toHaveLength(1);

      // No player appears more than once
      const counts = slotCounts(matches);
      expect(Object.values(counts).every(c => c === 1)).toBe(true);
    });

    it('converts an existing bye match into a real match when one new player is added', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3'],
        activePlayers: ['p1', 'p2', 'p3', 'p4'], // p4 just added
        matches: [
          makeMatch('m1', {
            player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
          makeMatch('m2', { player1Id: 'p3', player2Id: 'BYE', winnerId: 'p3', games: [] }),
        ],
      });

      const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      // The old bye match is dropped and replaced with a real p3-vs-p4 match
      expect(removedMatchIds).toContain('m2');
      expect(addedMatches).toHaveLength(1);
      expect([addedMatches[0].player1Id, addedMatches[0].player2Id].sort()).toEqual(['p3', 'p4']);
      expect(addedMatches[0].player2Id).not.toBe('BYE');

      expect(matches.some(m => m.id === 'm2')).toBe(false);
      expect(matches.find(m => m.id === 'm1')).toBeDefined();

      const counts = slotCounts(matches);
      expect(Object.values(counts).every(c => c === 1)).toBe(true);
    });

    it('gives a lone newly added player a fresh bye when everyone else already played', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2'],
        activePlayers: ['p1', 'p2', 'p3'], // p3 just added
        matches: [
          makeMatch('m1', {
            player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
        ],
      });

      const { addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds).toHaveLength(0);
      expect(addedMatches).toHaveLength(1);
      expect(addedMatches[0].player1Id).toBe('p3');
      expect(addedMatches[0].player2Id).toBe('BYE');
      expect(addedMatches[0].winnerId).toBe('p3');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Removing players
  // ───────────────────────────────────────────────────────────────────────
  describe('removing players', () => {
    it('drops an unplayed match for a removed player and returns the opponent to the pool', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p3', 'p4'], // p2 removed by the caller
        matches: [
          makeMatch('m1', { player1Id: 'p1', player2Id: 'p2', games: [] }), // unplayed
          makeMatch('m2', {
            player1Id: 'p3', player2Id: 'p4', winnerId: 'p3',
            games: [{ id: 'g1', matchId: 'm2', player1Id: 'p3', player2Id: 'p4', score1: 11, score2: 5, date: '' }],
          }),
        ],
      });

      const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds).toContain('m1');
      // p1 (freed by p2's removal) gets a bye since no one else is available
      expect(addedMatches).toHaveLength(1);
      expect(addedMatches[0].player1Id).toBe('p1');
      expect(addedMatches[0].player2Id).toBe('BYE');

      // p2 must not appear anywhere in the result
      const allIds = matches.flatMap(m => [m.player1Id, m.player2Id]);
      expect(allIds).not.toContain('p2');

      // The already-played match is untouched
      const kept = matches.find(m => m.id === 'm2')!;
      expect(kept.winnerId).toBe('p3');
    });

    it('leaves an already-played match untouched even though one participant was removed', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2'],
        activePlayers: ['p1'], // p2 removed, but they already played
        matches: [
          makeMatch('m1', {
            player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
        ],
      });

      const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds).toHaveLength(0);
      expect(addedMatches).toHaveLength(0); // p1 already has a real result this round — nothing to pair
      const kept = matches.find(m => m.id === 'm1')!;
      expect(kept.player1Id).toBe('p1');
      expect(kept.player2Id).toBe('p2');
      expect(kept.winnerId).toBe('p1');
    });

    it('drops a removed player\'s bye match rather than keeping their automatic win', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3'],
        activePlayers: ['p1', 'p2'], // p3 removed
        matches: [
          makeMatch('m1', { player1Id: 'p1', player2Id: 'p2', games: [] }),
          makeMatch('m2', { player1Id: 'p3', player2Id: 'BYE', winnerId: 'p3', games: [] }),
        ],
      });

      const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds).toContain('m2');
      expect(matches.some(m => m.id === 'm2')).toBe(false);
      // p1 and p2 simply get re-paired with each other
      expect(addedMatches).toHaveLength(1);
      expect([addedMatches[0].player1Id, addedMatches[0].player2Id].sort()).toEqual(['p1', 'p2']);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Regression: simultaneous add + remove must never duplicate a player
  // ───────────────────────────────────────────────────────────────────────
  describe('simultaneous add + remove (duplicate-match regression)', () => {
    it('never places a player in two matches when a request both adds and removes players at once', () => {
      // Bug scenario: 4 players paired in 2 unplayed matches. In one request,
      // p2 is removed AND p5 is added. The old two-branch implementation
      // created fresh matches for p5 *and* fresh matches for the whole active
      // set, double-booking players. resync must do this in one atomic pass.
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p3', 'p4', 'p5'], // p2 removed, p5 added
        matches: [
          makeMatch('m1', { player1Id: 'p1', player2Id: 'p2', games: [] }),
          makeMatch('m2', { player1Id: 'p3', player2Id: 'p4', games: [] }),
        ],
      });

      const { matches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds.sort()).toEqual(['m1', 'm2']);

      const rrMatches = matches.filter(m => m.round === 'roundRobin');
      const counts = slotCounts(rrMatches);

      // p2 is gone, everyone else appears in exactly one match
      expect(counts['p2']).toBeUndefined();
      expect(counts['p1']).toBe(1);
      expect(counts['p3']).toBe(1);
      expect(counts['p4']).toBe(1);
      expect(counts['p5']).toBe(1);
    });

    it('re-pairs an odd leftover into a single bye instead of duplicating them across matches', () => {
      // p1 vs p2 already played (locked, untouched). p3 vs p4 unplayed; p4 is
      // removed, leaving p3 as the sole leftover — they must get exactly one
      // bye match, not be duplicated across multiple matches.
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3'], // p4 removed, nobody added
        matches: [
          makeMatch('m1', {
            player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
          makeMatch('m2', { player1Id: 'p3', player2Id: 'p4', games: [] }),
        ],
      });

      const { matches } = resyncRoundRobinMatches(tournament);
      const rrMatches = matches.filter(m => m.round === 'roundRobin');
      expect(rrMatches).toHaveLength(2); // the locked p1-vs-p2 match + p3's new bye
      const byeMatch = rrMatches.find(m => m.id !== 'm1')!;
      expect(byeMatch.player1Id).toBe('p3');
      expect(byeMatch.player2Id).toBe('BYE');

      const counts = slotCounts(rrMatches);
      expect(counts['p3']).toBe(1);
      expect(counts['p4']).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Reactivation
  // ───────────────────────────────────────────────────────────────────────
  describe('reactivating a player', () => {
    it('returns a previously removed, never-played player to the pool when re-added', () => {
      // First resync: p3 gets removed while sitting on an unplayed bye.
      const removed = makeTournament({
        players: ['p1', 'p2', 'p3'],
        activePlayers: ['p1', 'p2'],
        matches: [
          makeMatch('m1', {
            player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
          makeMatch('m2', { player1Id: 'p3', player2Id: 'BYE', winnerId: 'p3', games: [] }),
        ],
      });
      const afterRemoval = resyncRoundRobinMatches(removed);
      expect(afterRemoval.matches.some(m => [m.player1Id, m.player2Id].includes('p3'))).toBe(false);

      // Second resync: p3 is reactivated.
      const reactivated: Tournament = {
        ...removed,
        activePlayers: ['p1', 'p2', 'p3'],
        matches: afterRemoval.matches,
      };
      const afterReactivation = resyncRoundRobinMatches(reactivated);

      expect(afterReactivation.addedMatches).toHaveLength(1);
      expect(afterReactivation.addedMatches[0].player1Id).toBe('p3');
      expect(afterReactivation.addedMatches[0].player2Id).toBe('BYE');

      const counts = slotCounts(afterReactivation.matches.filter(m => m.round === 'roundRobin'));
      expect(counts['p1']).toBe(1);
      expect(counts['p3']).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Stale data in earlier rounds (defensive cleanup)
  // ───────────────────────────────────────────────────────────────────────
  describe('earlier-round cleanup', () => {
    it('drops a stale unplayed match from an earlier round that contains a now-inactive player', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3'], // p4 removed
        matches: [
          // Earlier round — stale unplayed leftover involving the removed player
          makeMatch('m1', { bracketRound: 1, player1Id: 'p3', player2Id: 'p4', games: [] }),
          // Current round — fully played
          makeMatch('m2', {
            bracketRound: 2, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm2', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
        ],
      });

      const { matches, addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds).toContain('m1');
      expect(matches.some(m => m.id === 'm1')).toBe(false);
      // p3 had no result in the current round (their only match was the stale
      // round-1 leftover) so they return to the pool and get a bye there.
      expect(addedMatches).toHaveLength(1);
      expect(addedMatches[0].player1Id).toBe('p3');
      expect(addedMatches[0].bracketRound).toBe(2);
    });

    it('keeps an already-played match from an earlier round even if a participant is later removed', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3'], // p4 removed, but they already played round 1
        matches: [
          makeMatch('m1', {
            bracketRound: 1, player1Id: 'p1', player2Id: 'p4', winnerId: 'p4',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p4', score1: 5, score2: 11, date: '' }],
          }),
          makeMatch('m2', {
            bracketRound: 2, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g2', matchId: 'm2', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
        ],
      });

      const { matches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds).toHaveLength(0);
      const keptRound1 = matches.find(m => m.id === 'm1')!;
      expect(keptRound1.player2Id).toBe('p4');
      expect(keptRound1.winnerId).toBe('p4');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Pairing strategy
  // ───────────────────────────────────────────────────────────────────────
  describe('pairing strategy', () => {
    it('pairs top-ranked unpaired players together under the top-vs-top strategy', () => {
      // p1 (2 wins) and p3 (1 win) should be paired together over p2/p4 (0 wins)
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3', 'p4'],
        rrPairingStrategy: 'top-vs-top',
        matches: [
          makeMatch('m1', {
            bracketRound: 1, player1Id: 'p1', player2Id: 'p2', winnerId: 'p1',
            games: [{ id: 'g1', matchId: 'm1', player1Id: 'p1', player2Id: 'p2', score1: 11, score2: 5, date: '' }],
          }),
          makeMatch('m2', {
            bracketRound: 1, player1Id: 'p3', player2Id: 'p4', winnerId: 'p3',
            games: [{ id: 'g2', matchId: 'm2', player1Id: 'p3', player2Id: 'p4', score1: 11, score2: 9, date: '' }],
          }),
          makeMatch('m3', {
            bracketRound: 1, player1Id: 'p1', player2Id: 'p3', winnerId: 'p1',
            games: [{ id: 'g3', matchId: 'm3', player1Id: 'p1', player2Id: 'p3', score1: 11, score2: 7, date: '' }],
          }),
          // Round 2 (current) — nobody has played yet, all four need pairing
          makeMatch('m4', { bracketRound: 2, player1Id: 'p1', player2Id: 'p4', games: [] }),
          makeMatch('m5', { bracketRound: 2, player1Id: 'p2', player2Id: 'p3', games: [] }),
        ],
      });

      const { addedMatches, removedMatchIds } = resyncRoundRobinMatches(tournament);

      expect(removedMatchIds.sort()).toEqual(['m4', 'm5']);
      const topMatch = addedMatches.find(m => m.player2Id !== 'BYE');
      expect(topMatch).toBeDefined();
      expect([topMatch!.player1Id, topMatch!.player2Id]).toContain('p1');
      expect([topMatch!.player1Id, topMatch!.player2Id]).toContain('p3');
    });

    it('random strategy (default) still produces exactly one slot per active player, no duplicates', () => {
      const tournament = makeTournament({
        players: ['p1', 'p2', 'p3', 'p4'],
        activePlayers: ['p1', 'p2', 'p3', 'p4'],
        matches: [
          makeMatch('m1', { player1Id: 'p1', player2Id: 'p2', games: [] }),
          makeMatch('m2', { player1Id: 'p3', player2Id: 'p4', games: [] }),
        ],
      });

      const { matches } = resyncRoundRobinMatches(tournament);
      const counts = slotCounts(matches.filter(m => m.round === 'roundRobin'));
      expect(counts).toEqual({ p1: 1, p2: 1, p3: 1, p4: 1 });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Safety guards
  // ───────────────────────────────────────────────────────────────────────
  describe('safety guards', () => {
    it('is a no-op once the bracket has started', () => {
      const tournament = makeTournament({
        status: 'bracket',
        bracketStartedAt: new Date().toISOString(),
        matches: [makeMatch('b1', { round: 'bracket', bracketRound: 1, player1Id: 'p1', player2Id: 'p2', games: [] })],
      });

      const result = resyncRoundRobinMatches(tournament);
      expect(result.addedMatches).toHaveLength(0);
      expect(result.removedMatchIds).toHaveLength(0);
      expect(result.matches).toEqual(tournament.matches);
    });

    it('is a no-op once the tournament is completed', () => {
      const tournament = makeTournament({
        status: 'completed',
        matches: [makeMatch('m1', { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', games: [] })],
      });

      const result = resyncRoundRobinMatches(tournament);
      expect(result.matches).toEqual(tournament.matches);
    });

    it('never touches bracket matches even if somehow present alongside round robin matches', () => {
      const tournament = makeTournament({
        matches: [
          makeMatch('rr1', { round: 'roundRobin', player1Id: 'p1', player2Id: 'p2', games: [] }),
          makeMatch('b1', { round: 'bracket', bracketRound: 1, player1Id: 'p3', player2Id: 'p4', games: [] }),
        ],
      });
      // Presence of a bracket match trips the bracketStarted guard by design.
      const result = resyncRoundRobinMatches(tournament);
      expect(result.matches).toEqual(tournament.matches);
      expect(result.addedMatches).toHaveLength(0);
    });
  });
});
