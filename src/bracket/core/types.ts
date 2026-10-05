/**
 * Structural types the bracket renderer accepts. They describe only the fields
 * the bracket reads, so any app-level match or player record with these fields
 * can be passed in directly.
 */

export type MatchSide = 1 | 2;

export interface BracketGame {
  id: string;
  score1: number;
  score2: number;
}

export interface BracketMatch {
  id: string;
  player1Id: string;
  player2Id: string;
  /** Team sides for doubles. Singles matches omit these and use the player fields. */
  side1PlayerIds?: string[];
  side2PlayerIds?: string[];
  /** 0 is the play-in round; 1 and up are main-bracket rounds. */
  bracketRound?: number;
  bestOf: number;
  games: BracketGame[];
  winnerId?: string;
  winnerSide?: MatchSide;
  /** The optional placement match between semifinal losers. */
  isThirdPlace?: boolean;
}

export interface BracketPlayer {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

/** A synthetic match drawn for a round that has not been created yet. */
export interface PlaceholderMatch extends BracketMatch {
  isPlaceholder: true;
}

export type DisplayMatch<M extends BracketMatch> = M | PlaceholderMatch;
