import { computeBracketLayout, isByeMatch, isFewerByesBracket } from '@/bracket/core';
import {
  advanceBracketRound,
  buildBracketFromPreview,
  cascadeBracketOutcomeChange,
  createBracketMatches,
  getPlayInWinnerPlaceholder,
  InvalidBracketError,
} from '../lib/tournament';
import { canUseFewerByes, getFewerByesCount, getStandardByeCount } from '@/bracket/core';
import { Game, Match, PlayInMode, Tournament } from '../types/pingpong';

function makeTournament(playerCount: number, playInMode: PlayInMode = 'fewerByes'): Tournament {
  const players = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  return {
    clubId: 'club-dallas',
    id: 't1', name: 'T1', startDate: '2026-11-01T00:00:00.000Z', status: 'bracket',
    roundRobinRounds: 1, rrBestOf: 1,
    bracketRounds: [{ matchCount: 6, bestOf: 3 }, { matchCount: 2, bestOf: 3 }, { matchCount: 1, bestOf: 5 }],
    players, activePlayers: players, matches: [],
    // Seeds in player order, so tests can name them.
    playerRanking: players,
    bracketConfig: { playInMode },
  };
}

/** Seeded generation: round-robin results that rank p1 first, p2 second and so on. */
function seededBracket(playerCount: number): Tournament {
  const tournament = makeTournament(playerCount);
  const game = (id: string, p1: string, p2: string): Game => ({ clubId: 'club-dallas', id, player1Id: p1, player2Id: p2, score1: 11, score2: 1, date: '2026-11-01' });
  const players = tournament.players;
  const roundRobin: Match[] = [];
  players.forEach((p, i) => players.slice(i + 1).forEach(q => roundRobin.push({
    id: `rr-${p}-${q}`, tournamentId: 't1', player1Id: p, player2Id: q, round: 'roundRobin', bracketRound: 1,
    bestOf: 1, games: [game(`g-${p}-${q}`, p, q)], winnerId: p,
  })));
  tournament.matches = roundRobin;
  tournament.matches = createBracketMatches(tournament);
  return tournament;
}

/** Plays a match to a win for `winnerId` and threads the result forward. */
function win(tournament: Tournament, matchId: string, winnerId: string) {
  const match = tournament.matches!.find(m => m.id === matchId)!;
  const game: Game = { clubId: 'club-dallas', id: `g-${matchId}-${winnerId}`, matchId, player1Id: match.player1Id, player2Id: match.player2Id, score1: 11, score2: 5, date: '2026-11-02' };
  tournament.matches = tournament.matches!.map(m => m.id === matchId ? { ...m, games: [game], winnerId } : m);
  const { matches, invalidatedGameIds } = cascadeBracketOutcomeChange(tournament.matches, matchId);
  tournament.matches = matches;
  return invalidatedGameIds;
}

const round = (tournament: Tournament, n: number) => tournament.matches!.filter(m => m.bracketRound === n);

describe('which fields can use fewer byes', () => {
  it.each([[6, true], [10, true], [12, true], [14, true], [18, true], [4, false], [8, false], [16, false], [11, false], [13, false]])(
    '%i players: %s', (count, expected) => {
      expect(canUseFewerByes(count)).toBe(expected);
    });

  it('halves the byes for 12 players', () => {
    expect(getStandardByeCount(12)).toBe(4);
    expect(getFewerByesCount(12)).toBe(2);
  });
});

describe('a 12-player bracket with fewer byes', () => {
  it('has everyone play round 1, top seed against bottom seed', () => {
    const tournament = seededBracket(12);
    expect(round(tournament, 0).map(m => [m.player1Id, m.player2Id])).toEqual([
      ['p1', 'p12'], ['p2', 'p11'], ['p3', 'p10'], ['p4', 'p9'], ['p5', 'p8'], ['p6', 'p7'],
    ]);
    expect(round(tournament, 0).every(m => m.bestOf === 3)).toBe(true);
    expect(isFewerByesBracket(tournament.matches!)).toBe(true);
  });

  it("gives the byes to the top two seeds' matches, on opposite sides", () => {
    const tournament = seededBracket(12);
    expect(round(tournament, 1).map(m => [m.player1Id, m.player2Id])).toEqual([
      [getPlayInWinnerPlaceholder(0, 6), 'BYE'],
      [getPlayInWinnerPlaceholder(3, 6), getPlayInWinnerPlaceholder(4, 6)],
      [getPlayInWinnerPlaceholder(2, 6), getPlayInWinnerPlaceholder(5, 6)],
      [getPlayInWinnerPlaceholder(1, 6), 'BYE'],
    ]);
    expect(round(tournament, 1).every(m => !m.winnerId)).toBe(true);
  });

  it('plays through to a champion in 11 real matches', () => {
    const tournament = seededBracket(12);
    round(tournament, 0).forEach(m => win(tournament, m.id, m.player1Id));

    // The byes went to the winners, and only they are decided.
    const second = round(tournament, 1);
    expect(second.filter(isByeMatch).map(m => m.winnerId)).toEqual(['p1', 'p2']);
    expect(advanceBracketRound(tournament)).toEqual([]);
    second.filter(m => !isByeMatch(m)).forEach(m => win(tournament, m.id, m.player1Id));

    const semis = advanceBracketRound(tournament);
    expect(semis.map(m => [m.player1Id, m.player2Id])).toEqual([['p1', 'p4'], ['p3', 'p2']]);
    expect(semis.every(m => m.bestOf === 3)).toBe(true);
    tournament.matches!.push(...semis);
    semis.forEach(m => win(tournament, m.id, m.player1Id));

    const [final] = advanceBracketRound(tournament);
    expect([final.player1Id, final.player2Id]).toEqual(['p1', 'p3']);
    expect(final.bestOf).toBe(5);

    const played = tournament.matches!.filter(m => m.round === 'bracket' && !isByeMatch(m));
    expect(played.length + 1).toBe(11);
  });

  it('lets a lower seed who wins round 1 take the bye', () => {
    const tournament = seededBracket(12);
    const [first] = round(tournament, 0);
    win(tournament, first.id, 'p12');
    const bye = round(tournament, 1).find(isByeMatch)!;
    expect(bye).toMatchObject({ player1Id: 'p12', winnerId: 'p12' });
  });

  it('corrects the bracket when a round 1 result is changed', () => {
    const tournament = seededBracket(12);
    const rows = round(tournament, 0);
    rows.forEach(m => win(tournament, m.id, m.player1Id));
    const real = round(tournament, 1).filter(m => !isByeMatch(m))[0]; // p4 v p5
    win(tournament, real.id, 'p4');

    const invalidated = win(tournament, rows[3].id, 'p9'); // p4's match turns out to be p9's

    const corrected = tournament.matches!.find(m => m.id === real.id)!;
    expect(corrected).toMatchObject({ player1Id: 'p9', player2Id: 'p5', games: [], winnerId: undefined });
    expect(invalidated).toHaveLength(1);
  });

  it('moves a corrected bye winner into the next round', () => {
    const tournament = seededBracket(12);
    const rows = round(tournament, 0);
    rows.forEach(m => win(tournament, m.id, m.player1Id));
    round(tournament, 1).filter(m => !isByeMatch(m)).forEach(m => win(tournament, m.id, m.player1Id));
    tournament.matches!.push(...advanceBracketRound(tournament));

    win(tournament, rows[0].id, 'p12');

    expect(round(tournament, 2)[0].player1Id).toBe('p12');
  });

  it('reopens the slot when the round 1 result is removed', () => {
    const tournament = seededBracket(12);
    const [first] = round(tournament, 0);
    win(tournament, first.id, 'p1');

    tournament.matches = tournament.matches!.map(m => m.id === first.id ? { ...m, games: [], winnerId: undefined } : m);
    tournament.matches = cascadeBracketOutcomeChange(tournament.matches, first.id).matches;

    expect(round(tournament, 1)[0]).toMatchObject({ player1Id: getPlayInWinnerPlaceholder(0, 6), winnerId: undefined });
    win(tournament, first.id, 'p12');
    expect(round(tournament, 1)[0]).toMatchObject({ player1Id: 'p12', winnerId: 'p12' });
  });
});

describe('starting from the preview', () => {
  it.each([6, 10, 12, 14])('accepts the %i-player bracket it generated', count => {
    const tournament = makeTournament(count);
    const generated = createBracketMatches({ ...tournament, matches: [] });
    const rebuilt = buildBracketFromPreview(tournament, generated);
    expect(rebuilt.map(m => [m.bracketRound, m.player1Id, m.player2Id, m.winnerId, m.bestOf]))
      .toEqual(generated.map(m => [m.bracketRound, m.player1Id, m.player2Id, m.winnerId, m.bestOf]));
  });

  it('still refuses a bye for a play-in winner when not everyone plays round 1', () => {
    const tournament = makeTournament(6, 'force');
    const submitted = [
      { bracketRound: 0, player1Id: 'p5', player2Id: 'p6' },
      { bracketRound: 1, player1Id: 'p1', player2Id: 'p2' },
      { bracketRound: 1, player1Id: 'p3', player2Id: 'p4' },
      { bracketRound: 1, player1Id: 'PLAY_IN_WINNER', player2Id: 'BYE' },
      { bracketRound: 1, player1Id: 'BYE', player2Id: 'BYE' },
    ];
    expect(() => buildBracketFromPreview(tournament, submitted)).toThrow(InvalidBracketError);
  });

  it.each([11, 8, 4])('falls back to the automatic bracket for %i players', count => {
    const tournament = makeTournament(count);
    const auto = makeTournament(count, 'auto');
    const shape = (matches: Match[]) => matches.map(m => m.bracketRound);
    expect(shape(createBracketMatches({ ...tournament, matches: [] })))
      .toEqual(shape(createBracketMatches({ ...auto, matches: [] })));
  });

  it("doesn't change standard brackets", () => {
    for (const mode of ['auto', 'force', 'none'] as PlayInMode[]) {
      for (let count = 4; count <= 12; count++) {
        const matches = createBracketMatches({ ...makeTournament(count, mode), matches: [] });
        expect(isFewerByesBracket(matches)).toBe(false);
      }
    }
  });
});

describe('drawing a fewer-byes bracket', () => {
  const layoutFor = (tournament: Tournament) => computeBracketLayout(tournament.matches!.filter(m => m.round === 'bracket'))!;

  it('shows four rounds and no bye cards', () => {
    const layout = layoutFor(seededBracket(12));
    expect(layout.playInLabel).toBe('Round 1');
    expect(layout.playInCards).toHaveLength(6);
    expect(layout.rounds.map(r => [r.label, r.cards.length])).toEqual([['Round 2', 2], ['Semifinal', 2], ['🏆 Final', 1]]);
    expect(layout.byeMarkers).toHaveLength(2);
  });

  it('centers each match between the two it follows and keeps cards apart', () => {
    const layout = layoutFor(seededBracket(12));
    const rows = layout.playInCards.map(c => c.y);
    const [upper, lower] = layout.rounds[0].cards;
    expect(upper.y).toBe((rows[1] + rows[2]) / 2);
    expect(lower.y).toBe((rows[3] + rows[4]) / 2);
    for (const marker of layout.byeMarkers) {
      for (const card of layout.rounds[0].cards) {
        expect(Math.abs(marker.y - (card.y + 38))).toBeGreaterThan(38);
      }
    }
  });

  it.each([6, 10, 14])('lays out %i players with every match on the canvas', count => {
    const layout = layoutFor(seededBracket(count));
    for (const { cards } of layout.rounds) {
      for (const card of cards) {
        expect(card.y).toBeGreaterThanOrEqual(0);
        expect(card.y).toBeLessThan(layout.height);
      }
    }
  });
});
