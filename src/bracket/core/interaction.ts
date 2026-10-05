import { BracketMatch } from './types';
import { BYE_PLACEHOLDER, hasPendingSlot, isByeMatch, isMatchComplete, isPendingSlot } from './model';

export interface BracketMode {
  /** Viewer cannot record or change anything. */
  readOnly: boolean;
  /** Bracket is a preview before it starts: players and byes can be rearranged, games cannot be recorded. */
  previewMode: boolean;
}

/** True when the viewer can edit something, either games or the preview structure. */
export function isEditable({ readOnly, previewMode }: BracketMode): boolean {
  return !readOnly || previewMode;
}

/** A match that has been decided by real play, as opposed to an automatic bye. */
function isPlayedMatch(match: BracketMatch): boolean {
  return match.games.length > 0 || (isMatchComplete(match) && !isByeMatch(match));
}

/** Whether clicking a card opens it. Read-only viewers can only open matches with scores. */
export function canSelectMatch(match: BracketMatch, mode: BracketMode): boolean {
  if (!isEditable(mode)) return match.games.length > 0;
  const hasSomethingToDo = mode.previewMode ||
    isByeMatch(match) ||
    !isMatchComplete(match) ||
    match.games.length > 0;
  return hasSomethingToDo && !hasPendingSlot(match);
}

/**
 * Whether a match's participants can be reassigned. Only unplayed matches with
 * known participants qualify, and the final and third-place match are fixed
 * once the semifinal losers have been placed.
 */
export function canSwapMatch(match: BracketMatch, bracketMatches: BracketMatch[], mode: BracketMode): boolean {
  if (!isEditable(mode)) return false;
  if (match.isThirdPlace) return false;
  if (bracketMatches.some(m => m.isThirdPlace && m.bracketRound === match.bracketRound)) return false;
  if (match.games.length > 0) return false;
  if (isMatchComplete(match) && !isByeMatch(match)) return false;
  return !hasPendingSlot(match);
}

/** Players who can be moved into a match: everyone in an unplayed match of the same round. */
export function getEligibleSwapPlayers(match: BracketMatch, bracketMatches: BracketMatch[]): string[] {
  const playerIds = bracketMatches
    .filter(m => m.bracketRound === match.bracketRound && !isPlayedMatch(m))
    .flatMap(m => [m.player1Id, m.player2Id])
    .filter(id => id !== BYE_PLACEHOLDER && !isPendingSlot(id));
  return [...new Set(playerIds)];
}

/** The real player in a bye match, or undefined when the match is not a bye. */
export function getByeHolder(match: BracketMatch): string | undefined {
  if (match.player1Id === BYE_PLACEHOLDER) return match.player2Id;
  if (match.player2Id === BYE_PLACEHOLDER) return match.player1Id;
  return undefined;
}
