import { getPlayInWinnerPlaceholder } from '../lib/tournament';
import { getBracketCardZIndex, getBracketSlotOffset, getPlayInTargetIndex, orderPlayInIndexesByTarget, shouldUseStraightPlayInConnector } from '../lib/bracketLayout';

describe('bracket play-in layout contract', () => {
  it('keeps indexed play-in placeholders addressable for stacked cards', () => {
    expect(getPlayInWinnerPlaceholder(0, 2)).toBe('PLAY_IN_WINNER_1');
    expect(getPlayInWinnerPlaceholder(1, 2)).toBe('PLAY_IN_WINNER_2');
  });

  it('renders play-in cards above main bracket cards and connectors', () => {
    expect(getBracketCardZIndex('main')).toBeGreaterThan(0);
    expect(getBracketCardZIndex('playIn')).toBeGreaterThan(getBracketCardZIndex('main'));
    expect(getBracketCardZIndex('playIn', true)).toBeGreaterThan(getBracketCardZIndex('playIn'));
  });

  it('targets the exact player row occupied by a play-in winner', () => {
    expect(getBracketSlotOffset(true)).toBe(0.25);
    expect(getBracketSlotOffset(false)).toBe(0.75);
  });

  it('orders play-ins by their destination R1 slot', () => {
    expect(orderPlayInIndexesByTarget(3, [3, 0, 2])).toEqual([1, 2, 0]);
  });

  it('orders a top-slot feeder before a bottom-slot feeder in the same match', () => {
    expect(orderPlayInIndexesByTarget(2, [1, 0])).toEqual([1, 0]);
  });

  it('keeps the target after the play-in placeholder becomes its winner', () => {
    expect(getPlayInTargetIndex(
      [{ player1Id: 'winner-p1', player2Id: 'p2' }],
      'PLAY_IN_WINNER',
      ['p1', 'winner-p1'],
      'winner-p1',
    )).toBe(0);
  });

  it('uses a straight connector for near-aligned play-in endpoints', () => {
    expect(shouldUseStraightPlayInConnector(396, 393)).toBe(true);
    expect(shouldUseStraightPlayInConnector(396, 420)).toBe(false);
  });
});
