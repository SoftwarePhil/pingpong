/**
 * Validates ping-pong game scores according to official deuce rules.
 *
 * A game is valid when both scores are whole numbers of zero or more and:
 *   - The winner has reached 11 points with a lead of at least 2 (11–9 or
 *     wider), OR
 *   - After a 10–10 deuce, the winner leads by exactly 2 points (12–10, 13–11…).
 *
 * Returns null on success, or an error message string on failure.
 */
export function validateScore(score1: unknown, score2: unknown): string | null {
  if (!isPointCount(score1) || !isPointCount(score2)) {
    return 'Scores must be whole numbers of 0 or more';
  }

  const maxScore = Math.max(score1, score2);
  const minScore = Math.min(score1, score2);
  const diff = maxScore - minScore;

  if (maxScore < 11) {
    return 'Game must reach 11 points to be complete';
  }
  if (maxScore === 11 ? diff < 2 : diff !== 2) {
    return 'Game must be won by 2 points';
  }
  return null;
}

function isPointCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
