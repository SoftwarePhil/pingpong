import {
  BracketMatch,
  BRACKET_GEOMETRY,
  BYE_PLACEHOLDER,
  PLAY_IN_WINNER_PLACEHOLDER,
  TBD_PLACEHOLDER,
  canSelectMatch,
  canSwapMatch,
  computeBracketLayout,
  getByeHolder,
  getEligibleSwapPlayers,
  isPlaceholderMatch,
} from '@/bracket/core';

let nextId = 0;
function match(player1Id: string, player2Id: string, bracketRound: number, extra: Partial<BracketMatch> = {}): BracketMatch {
  nextId += 1;
  return { id: `m${nextId}`, player1Id, player2Id, bracketRound, bestOf: 1, games: [], ...extra };
}
function won(m: BracketMatch, winnerId: string): BracketMatch {
  const side1Won = winnerId === m.player1Id;
  return { ...m, winnerId, games: [{ id: `${m.id}-g1`, score1: side1Won ? 11 : 5, score2: side1Won ? 5 : 11 }] };
}

const { cardWidth, cardHeight, rowGap, columnGap } = BRACKET_GEOMETRY;
const rowUnit = cardHeight + rowGap;
const columnUnit = cardWidth + columnGap;

const editable = { readOnly: false, previewMode: false };
const readOnly = { readOnly: true, previewMode: false };
const preview = { readOnly: true, previewMode: true };

describe('computeBracketLayout', () => {
  it('returns null when there is nothing to draw', () => {
    expect(computeBracketLayout([])).toBeNull();
  });

  it('fills rounds that have not been created yet with placeholder cards', () => {
    const layout = computeBracketLayout([match('a', 'b', 1), match('c', 'd', 1)])!;

    expect(layout.rounds.map(r => r.label)).toEqual(['Semifinal', '🏆 Final']);
    expect(layout.rounds[1].isChampionship).toBe(true);
    expect(layout.rounds[1].isFinalRound).toBe(true);
    const final = layout.rounds[1].cards[0].match;
    expect(isPlaceholderMatch(final)).toBe(true);
    expect(final.player1Id).toBe(TBD_PLACEHOLDER);
  });

  it('positions cards so each later match sits between the two that feed it', () => {
    const layout = computeBracketLayout([match('a', 'b', 1), match('c', 'd', 1)])!;
    const [semi1, semi2] = layout.rounds[0].cards;
    const [final] = layout.rounds[1].cards;

    expect(semi1).toMatchObject({ x: 0, y: rowGap / 2 });
    expect(semi2).toMatchObject({ x: 0, y: rowUnit + rowGap / 2 });
    expect(final.x).toBe(columnUnit);
    expect(final.y + cardHeight / 2).toBe((semi1.y + semi2.y) / 2 + cardHeight / 2);
    expect(layout.width).toBe(2 * columnUnit - columnGap + 2);
    expect(layout.height).toBe(2 * rowUnit);
    expect(layout.connectors.map(c => c.key)).toEqual(['r0-0']);
  });

  it('keeps created later-round matches and pads the rest of the round', () => {
    const r1 = [match('a', 'b', 1), match('c', 'd', 1), match('e', 'f', 1), match('g', 'h', 1)];
    const r2 = match('a', 'c', 2);
    const layout = computeBracketLayout([...r1, r2])!;

    expect(layout.rounds.map(r => r.label)).toEqual(['Quarterfinal', 'Semifinal', '🏆 Final']);
    expect(layout.rounds[1].cards[0].match).toBe(r2);
    expect(isPlaceholderMatch(layout.rounds[1].cards[1].match)).toBe(true);
  });

  it('reports the champion only once the final is decided', () => {
    const semis = [won(match('a', 'b', 1), 'a'), won(match('c', 'd', 1), 'c')];
    const openFinal = match('a', 'c', 2);
    expect(computeBracketLayout([...semis, openFinal])!.championMatch).toBeNull();

    const decidedFinal = won(openFinal, 'c');
    expect(computeBracketLayout([...semis, decidedFinal])!.championMatch).toBe(decidedFinal);
  });

  describe('third place', () => {
    it('reserves a slot under the final when four players can reach the semifinals', () => {
      const layout = computeBracketLayout([match('a', 'b', 1), match('c', 'd', 1)], { showThirdPlace: true })!;
      expect(layout.thirdPlace).not.toBeNull();
      expect(isPlaceholderMatch(layout.thirdPlace!.match)).toBe(true);
      expect(layout.thirdPlace!.x).toBe(layout.rounds[1].cards[0].x);
    });

    it('is omitted when a bye means there will be no second semifinal loser', () => {
      const layout = computeBracketLayout([match('a', BYE_PLACEHOLDER, 1), match('c', 'd', 1)], { showThirdPlace: true })!;
      expect(layout.thirdPlace).toBeNull();
    });

    it('shows the real third-place match instead of a placeholder once it exists', () => {
      const thirdPlace = match('b', 'd', 2, { isThirdPlace: true });
      const layout = computeBracketLayout(
        [won(match('a', 'b', 1), 'a'), won(match('c', 'd', 1), 'c'), match('a', 'c', 2), thirdPlace],
        { showThirdPlace: true },
      )!;
      expect(layout.thirdPlace!.match).toBe(thirdPlace);
      // The placement match is drawn separately, never as a main-bracket card.
      expect(layout.rounds.flatMap(r => r.cards).some(c => c.match === thirdPlace)).toBe(false);
    });
  });

  describe('play-in round', () => {
    it('shifts the main bracket right and links the play-in to the slot it feeds', () => {
      const playIn = match('d', 'e', 0);
      const layout = computeBracketLayout([playIn, match('a', PLAY_IN_WINNER_PLACEHOLDER, 1), match('b', 'c', 1)])!;

      expect(layout.playInMatches).toEqual([playIn]);
      expect(layout.rounds[0].cards[0].x).toBe(columnUnit);
      const targetY = layout.rounds[0].cards[0].y + cardHeight * 0.75; // bottom slot
      expect(layout.connectors[0]).toEqual({
        key: 'playin-0',
        d: `M ${cardWidth} ${cardHeight / 2} H ${cardWidth + columnGap / 2} V ${targetY} H ${columnUnit}`,
        dashed: true,
      });
    });

    it('still finds the target slot after the play-in winner has replaced the placeholder', () => {
      const playIn = won(match('d', 'e', 0), 'e');
      const layout = computeBracketLayout([playIn, match('b', 'c', 1), match('a', 'e', 1)])!;
      expect(layout.connectors[0].d).toContain(`V ${layout.rounds[0].cards[1].y + cardHeight * 0.75}`);
    });

    it('orders play-ins top to bottom by the slot they feed', () => {
      const feedsSecond = match('e', 'f', 0);
      const feedsFirst = match('g', 'h', 0);
      const layout = computeBracketLayout([
        feedsSecond,
        feedsFirst,
        match('a', `${PLAY_IN_WINNER_PLACEHOLDER}_2`, 1),
        match('b', `${PLAY_IN_WINNER_PLACEHOLDER}_1`, 1),
      ])!;
      expect(layout.playInMatches).toEqual([feedsFirst, feedsSecond]);
    });

    it('labels a four-match first round fed by play-ins as having no byes', () => {
      const layout = computeBracketLayout([
        match('h', 'i', 0),
        match('a', PLAY_IN_WINNER_PLACEHOLDER, 1),
        match('b', 'c', 1),
        match('d', 'e', 1),
        match('f', 'g', 1),
      ])!;
      expect(layout.rounds[0].label).toBe('Main R1 (no byes)');
    });

    it('makes the canvas tall enough for more play-ins than first-round matches', () => {
      const layout = computeBracketLayout([
        match('c', 'd', 0),
        match('e', 'f', 0),
        match('g', 'h', 0),
        match(`${PLAY_IN_WINNER_PLACEHOLDER}_1`, `${PLAY_IN_WINNER_PLACEHOLDER}_2`, 1),
      ])!;
      expect(layout.height).toBe(3 * rowUnit);
    });
  });
});

describe('bracket interaction rules', () => {
  describe('canSelectMatch', () => {
    it('lets read-only viewers open only matches that have scores', () => {
      expect(canSelectMatch(match('a', 'b', 1), readOnly)).toBe(false);
      expect(canSelectMatch(won(match('a', 'b', 1), 'a'), readOnly)).toBe(true);
    });

    it('lets editors open unplayed matches, byes and scored matches', () => {
      expect(canSelectMatch(match('a', 'b', 1), editable)).toBe(true);
      expect(canSelectMatch(match('a', BYE_PLACEHOLDER, 1, { winnerId: 'a' }), editable)).toBe(true);
      expect(canSelectMatch(won(match('a', 'b', 1), 'a'), editable)).toBe(true);
    });

    it('does not open a match decided without games unless previewing', () => {
      const decidedWithoutGames = match('a', 'b', 1, { winnerId: 'a' });
      expect(canSelectMatch(decidedWithoutGames, editable)).toBe(false);
      expect(canSelectMatch(decidedWithoutGames, preview)).toBe(true);
    });

    it('does not open a match still waiting on another result', () => {
      expect(canSelectMatch(match('a', TBD_PLACEHOLDER, 2), editable)).toBe(false);
      expect(canSelectMatch(match('a', PLAY_IN_WINNER_PLACEHOLDER, 1), preview)).toBe(false);
    });
  });

  describe('canSwapMatch', () => {
    it('allows swaps in unplayed matches and byes', () => {
      const unplayed = match('a', 'b', 1);
      const bye = match('c', BYE_PLACEHOLDER, 1, { winnerId: 'c' });
      expect(canSwapMatch(unplayed, [unplayed, bye], editable)).toBe(true);
      expect(canSwapMatch(bye, [unplayed, bye], preview)).toBe(true);
    });

    it('blocks swaps for read-only viewers and played matches', () => {
      const unplayed = match('a', 'b', 1);
      const played = won(match('c', 'd', 1), 'c');
      expect(canSwapMatch(unplayed, [unplayed], readOnly)).toBe(false);
      expect(canSwapMatch(played, [played], editable)).toBe(false);
    });

    it('fixes the final and third-place participants once both exist', () => {
      const final = match('a', 'c', 2);
      const thirdPlace = match('b', 'd', 2, { isThirdPlace: true });
      expect(canSwapMatch(final, [final, thirdPlace], editable)).toBe(false);
      expect(canSwapMatch(thirdPlace, [final, thirdPlace], editable)).toBe(false);
    });
  });

  it('offers every player from unplayed matches in the same round, once each', () => {
    const target = match('a', 'b', 1);
    const bye = match('c', BYE_PLACEHOLDER, 1, { winnerId: 'c' });
    const played = won(match('d', 'e', 1), 'd');
    const waiting = match('f', PLAY_IN_WINNER_PLACEHOLDER, 1);
    const otherRound = match('g', 'h', 2);
    expect(getEligibleSwapPlayers(target, [target, bye, played, waiting, otherRound, target]))
      .toEqual(['a', 'b', 'c', 'f']);
  });

  it('identifies the player holding a bye on either side', () => {
    expect(getByeHolder(match('a', BYE_PLACEHOLDER, 1))).toBe('a');
    expect(getByeHolder(match(BYE_PLACEHOLDER, 'b', 1))).toBe('b');
    expect(getByeHolder(match('a', 'b', 1))).toBeUndefined();
  });
});
