import { Match } from '../types/pingpong';
import { getGameSides, getMatchSides, getWinningSide, isPlayerId } from './matchFormat';

export interface PlayerStandings {
  wins: number;
  losses: number;
  played: number;
  gamesPlayed: number;
  pointDiff: number;
}

function emptyStanding(): PlayerStandings {
  return { wins: 0, losses: 0, played: 0, gamesPlayed: 0, pointDiff: 0 };
}

/**
 * Calculates individual round-robin standings from singles and doubles matches.
 * A doubles result is applied once to every player on the relevant side.
 */
export function getRoundRobinStandings(
  playerIds: string[],
  matches: Match[],
): Record<string, PlayerStandings> {
  return getIndividualStandings(playerIds, matches.filter(match => match.round === 'roundRobin'));
}

/** Calculates individual standings across any match collection, including brackets. */
export function getIndividualStandings(
  playerIds: string[],
  matches: Match[],
): Record<string, PlayerStandings> {
  const playerSet = new Set(playerIds);
  const standings: Record<string, PlayerStandings> = {};
  playerIds.forEach(playerId => { standings[playerId] = emptyStanding(); });

  matches.forEach(match => {
      const [side1, side2] = getMatchSides(match);
      const side1Players = side1.filter(playerId => playerSet.has(playerId));
      const side2Players = side2.filter(playerId => playerSet.has(playerId));

      // Automatic byes do not count as a match or a point result. Marker games
      // are retained for the real player's seed, but have no opposing player.
      const isBye = side1.includes('BYE') || side2.includes('BYE');
      const hasMarker = side1.includes('MARKER') || side2.includes('MARKER');
      if (isBye) return;

      match.games.forEach(game => {
        const [gameSide1, gameSide2] = getGameSides(game);
        const gameSide1Players = gameSide1.filter(playerId => playerSet.has(playerId));
        const gameSide2Players = gameSide2.filter(playerId => playerSet.has(playerId));
        gameSide1Players.forEach(playerId => {
          standings[playerId].gamesPlayed++;
          standings[playerId].pointDiff += game.score1 - game.score2;
        });
        gameSide2Players.forEach(playerId => {
          standings[playerId].gamesPlayed++;
          standings[playerId].pointDiff += game.score2 - game.score1;
        });
      });

      const winningSide = getWinningSide(match);
      if (!winningSide) return;

      const winnerPlayers = winningSide === 1 ? side1Players : side2Players;
      const loserPlayers = winningSide === 1 ? side2Players : side1Players;

      if (hasMarker && winnerPlayers.length > 0) {
        winnerPlayers.forEach(playerId => {
          standings[playerId].wins++;
          standings[playerId].played++;
        });
        return;
      }

      if (winnerPlayers.length > 0) {
        winnerPlayers.forEach(playerId => {
          standings[playerId].wins++;
          standings[playerId].played++;
        });
      }
      loserPlayers.forEach(playerId => {
        standings[playerId].losses++;
        standings[playerId].played++;
      });
    });

  return standings;
}

export function rankPlayersByRoundRobinStandings(
  playerIds: string[],
  matches: Match[],
): string[] {
  const standings = getRoundRobinStandings(playerIds, matches);
  return [...playerIds].sort((a, b) => {
    if (standings[b].wins !== standings[a].wins) {
      return standings[b].wins - standings[a].wins;
    }
    if (standings[b].pointDiff !== standings[a].pointDiff) {
      return standings[b].pointDiff - standings[a].pointDiff;
    }
    if (standings[a].played !== standings[b].played) {
      return standings[a].played - standings[b].played;
    }
    return a.localeCompare(b);
  });
}

/** True when every supplied ID is a real player and none is a synthetic slot. */
export function hasOnlyRealPlayers(ids: string[]): boolean {
  return ids.length > 0 && ids.every(isPlayerId);
}
