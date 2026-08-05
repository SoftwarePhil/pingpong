export interface Player {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthday?: string; // ISO calendar date (YYYY-MM-DD)
  profilePicture?: string;
  tournamentIds: string[]; // Tournaments this player has participated in
}

export interface Game {
  id: string;
  matchId?: string;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  date: string; // ISO string
}

export interface Tournament {
  id: string;
  name: string;
  startDate: string;
  status: 'roundRobin' | 'bracket' | 'completed';
  bracketStartedAt?: string; // Set when bracket is explicitly started
  roundRobinRounds: number;
  rrBestOf: number;
  bracketRounds: { matchCount: number; bestOf: number }[];
  players: string[];
  activePlayers?: string[]; // Subset of players currently active (affects current/future RR rounds and bracket; undefined = all players)
  rrPairingStrategy?: 'random' | 'top-vs-top'; // Strategy for determining RR pairings (default: 'random')
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
  round: 'roundRobin' | 'bracket';
  bracketRound?: number;
  bestOf: number;
  games: Game[];
  winnerId?: string;
}

/** Synthetic opponent used only for round-robin marker games. */
export const MARKER_PLAYER_ID = 'MARKER';

export type PlayInMode = 'auto' | 'force' | 'none';

export interface BracketConfig {
  playInMode?: PlayInMode;
  byePlayerIds?: string[];
}
