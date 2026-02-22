export interface Player {
  id: string;
  name: string;
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
  roundRobinRounds: number;
  rrBestOf: number;
  bracketRounds: { matchCount: number; bestOf: number }[];
  players: string[];
  activePlayers?: string[]; // Subset of players currently active (affects current/future RR rounds and bracket; undefined = all players)
  playerRanking?: string[];
  matches?: Match[]; // Embedded matches for hybrid schema
}

export interface Match {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string;
  round: 'roundRobin' | 'bracket';
  bracketRound?: number;
  bestOf: number;
  games: Game[];
  winnerId?: string;
}
