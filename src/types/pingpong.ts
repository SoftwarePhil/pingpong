/** A club: the group whose players, tournaments and games these are. */
export interface Club {
  id: string;
  name: string;
  /** Unique, URL-safe name used in the club's public page address. */
  slug: string;
  /** Free text for the public page. Empty until an admin writes it. */
  about?: string;
  createdAt: string;
}

// clubId is optional on Player, Tournament and Game only until the clubs
// migration (scripts/migrate-clubs.mjs) has filled it in on existing records.

export interface Player {
  id: string;
  clubId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthday?: string; // ISO calendar date (YYYY-MM-DD)
  profilePicture?: string;
  tournamentIds: string[]; // Tournaments this player has participated in
  /** When the player was added. Older players omit it; their id is the creation timestamp. */
  createdAt?: string;
}

export interface Game {
  id: string;
  clubId?: string;
  matchId?: string;
  player1Id: string;
  player2Id: string;
  /** Participant snapshot for doubles games. Legacy singles games omit these. */
  side1PlayerIds?: string[];
  side2PlayerIds?: string[];
  score1: number;
  score2: number;
  date: string; // ISO string
}

export type RoundRobinFormat = 'singles' | 'doubles';

export interface Tournament {
  id: string;
  clubId?: string;
  name: string;
  startDate: string;
  status: 'roundRobin' | 'bracket' | 'completed';
  bracketStartedAt?: string; // Set when bracket is explicitly started
  roundRobinRounds: number;
  rrBestOf: number;
  bracketRounds: { matchCount: number; bestOf: number }[];
  players: string[];
  activePlayers?: string[]; // Subset of players currently active (affects current/future RR rounds and bracket; undefined = all players)
  rrPairingStrategy?: 'random' | 'top-vs-top' | 'swiss'; // Strategy for determining RR pairings (default: 'random')
  /** Format overrides for individual round-robin rounds. Missing entries are singles. */
  roundRobinFormats?: Record<number, RoundRobinFormat>;
  playerRanking?: string[];
  matches?: Match[]; // Embedded matches for hybrid schema
  bracketConfig?: BracketConfig; // Custom bracket setup chosen in preview
}

export interface Match {
  id: string;
  tournamentId: string;
  /** Creation timestamp for new matches; older matches may not have one. */
  createdAt?: string;
  player1Id: string;
  player2Id: string;
  /** Team sides for a doubles match. Legacy singles matches omit these. */
  side1PlayerIds?: string[];
  side2PlayerIds?: string[];
  round: 'roundRobin' | 'bracket';
  bracketRound?: number;
  bestOf: number;
  games: Game[];
  winnerId?: string;
  /** Winning side for doubles matches. Singles and legacy byes use winnerId. */
  winnerSide?: 1 | 2;
  /** True for the optional placement match between semifinal losers. */
  isThirdPlace?: boolean;
}

/** Synthetic opponent used only for round-robin marker games. */
export const MARKER_PLAYER_ID = 'MARKER';

export type PlayInMode = 'auto' | 'force' | 'none';

export interface BracketConfig {
  playInMode?: PlayInMode;
  thirdPlaceMatch?: boolean;
}
