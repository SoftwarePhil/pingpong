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
  bracketRounds: { round: number; bestOf: number }[];
  players: string[];
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
