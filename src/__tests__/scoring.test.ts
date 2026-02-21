import { validateScore } from '../lib/scoring';

describe('validateScore', () => {
  describe('valid scores', () => {
    it('accepts a standard 11-X win (11-0)', () => {
      expect(validateScore(11, 0)).toBeNull();
    });

    it('accepts a standard 11-9 win', () => {
      expect(validateScore(11, 9)).toBeNull();
    });

    it('accepts a 11-0 win for player 2', () => {
      expect(validateScore(0, 11)).toBeNull();
    });

    it('accepts a deuce win at 12-10', () => {
      expect(validateScore(12, 10)).toBeNull();
    });

    it('accepts a deuce win at 10-12', () => {
      expect(validateScore(10, 12)).toBeNull();
    });

    it('accepts a long deuce game at 15-13', () => {
      expect(validateScore(15, 13)).toBeNull();
    });

    it('accepts a long deuce game at 25-23', () => {
      expect(validateScore(25, 23)).toBeNull();
    });
  });

  describe('invalid scores — game not finished', () => {
    it('rejects scores where neither player has reached 11', () => {
      expect(validateScore(10, 9)).toBe('Game must reach 11 points to be complete');
    });

    it('rejects 0-0', () => {
      expect(validateScore(0, 0)).toBe('Game must reach 11 points to be complete');
    });

    it('rejects 10-0 (max is 10)', () => {
      expect(validateScore(10, 0)).toBe('Game must reach 11 points to be complete');
    });
  });

  describe('invalid scores — margin too small or too large', () => {
    it('rejects 12-11 (only 1 point ahead past 11)', () => {
      expect(validateScore(12, 11)).toBe('Game must be won by 2 points');
    });

    it('rejects 15-12 (3 points ahead past 11)', () => {
      expect(validateScore(15, 12)).toBe('Game must be won by 2 points');
    });

    it('rejects 13-10 (3 points ahead past 11)', () => {
      expect(validateScore(13, 10)).toBe('Game must be won by 2 points');
    });

    it('rejects 20-15 (5 points ahead past 11)', () => {
      expect(validateScore(20, 15)).toBe('Game must be won by 2 points');
    });
  });
});
