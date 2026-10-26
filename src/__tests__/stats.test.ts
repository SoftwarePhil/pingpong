import { wilsonLowerBound } from '../lib/stats';

describe('wilsonLowerBound', () => {
  it('uses a conservative ranking score for small samples', () => {
    expect(wilsonLowerBound(1, 1)).toBeLessThan(wilsonLowerBound(7, 10));
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('ranks the same win rate higher with more matches played', () => {
    expect(wilsonLowerBound(5, 10)).toBeLessThan(wilsonLowerBound(50, 100));
  });

  it('stays between 0 and the observed win rate', () => {
    for (const [wins, total] of [[0, 5], [3, 5], [5, 5], [60, 101]]) {
      const score = wilsonLowerBound(wins, total);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(wins / total);
    }
  });
});
