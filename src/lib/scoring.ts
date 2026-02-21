/**
 * Validates ping-pong game scores according to official deuce rules.
 *
 * A game is valid when:
 *   - The winner has reached at least 11 points, AND
 *   - The winning margin is at least 1 point (normal finish at 11), OR
 *   - After a 10-10 deuce, the winner leads by exactly 2 points.
 *
 * Returns null on success, or an error message string on failure.
 */
export function validateScore(score1: number, score2: number): string | null {
  const maxScore = Math.max(score1, score2);
  const minScore = Math.min(score1, score2);
  const diff = maxScore - minScore;

  if (maxScore < 11) {
    return 'Game must reach 11 points to be complete';
  }
  if (maxScore > 11 && diff !== 2) {
    return 'Game must be won by 2 points';
  }
  return null;
}
