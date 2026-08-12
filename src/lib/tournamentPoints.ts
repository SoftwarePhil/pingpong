import { Match, Tournament } from '../types/pingpong';

export interface TournamentPointValues {
  firstPlacePoints: number;
  secondPlacePoints: number;
  thirdPlacePoints: number;
}

export interface TournamentPlacements {
  firstPlaceId: string | null;
  secondPlaceId: string | null;
  thirdPlaceIds: string[];
}

export interface TournamentPointsLeaderboardEntry {
  playerId: string;
  totalPoints: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  tournamentsPlayed: number;
}

export interface TournamentPointsResult {
  winnerId: string | null;
  leaderboard: TournamentPointsLeaderboardEntry[];
  tournamentResults: {
    tournamentId: string;
    firstPlaceId: string | null;
    secondPlaceId: string | null;
    thirdPlaceIds: string[];
    multiplier: number;
  }[];
}

export const DEFAULT_TOURNAMENT_POINT_VALUES: TournamentPointValues = {
  firstPlacePoints: 3,
  secondPlacePoints: 2,
  thirdPlacePoints: 1,
};

export function getTournamentDateKey(startDate: string): string {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const NON_PLAYER_IDS = new Set(['BYE', 'MARKER', 'PLAY_IN_WINNER', 'TBD']);

function isPlayerId(playerId: string | undefined): playerId is string {
  return Boolean(playerId && !NON_PLAYER_IDS.has(playerId));
}

function bracketRound(match: Match): number {
  // Older bracket records may not have bracketRound. Treat those as round 1,
  // while an explicit round 0 remains a play-in and is excluded.
  return match.bracketRound ?? 1;
}

function getOpponent(match: Match, winnerId: string): string | null {
  const opponentId = match.player1Id === winnerId ? match.player2Id : match.player1Id;
  return isPlayerId(opponentId) ? opponentId : null;
}

function getLoser(match: Match): string | null {
  if (!match.winnerId || !isPlayerId(match.winnerId)) return null;
  return getOpponent(match, match.winnerId);
}

function getRoundRobinRanking(tournament: Tournament): string[] {
  const stats: Record<string, { wins: number; pointDiff: number; played: number }> = {};
  const playerIds = tournament.players.filter(isPlayerId);
  playerIds.forEach(playerId => {
    stats[playerId] = { wins: 0, pointDiff: 0, played: 0 };
  });

  (tournament.matches ?? [])
    .filter(match => match.round === 'roundRobin')
    .forEach(match => {
      if (
        match.player2Id === 'BYE' ||
        !isPlayerId(match.player1Id) ||
        !isPlayerId(match.player2Id)
      ) {
        return;
      }

      if (match.winnerId && stats[match.winnerId]) {
        stats[match.winnerId].wins++;
        stats[match.winnerId].played++;
        const loserId = getOpponent(match, match.winnerId);
        if (loserId && stats[loserId]) stats[loserId].played++;
      }

      match.games.forEach(game => {
        if (stats[game.player1Id]) stats[game.player1Id].pointDiff += game.score1 - game.score2;
        if (stats[game.player2Id]) stats[game.player2Id].pointDiff += game.score2 - game.score1;
      });
    });

  return playerIds.sort((a, b) => {
    if (stats[b].wins !== stats[a].wins) return stats[b].wins - stats[a].wins;
    if (stats[b].pointDiff !== stats[a].pointDiff) return stats[b].pointDiff - stats[a].pointDiff;
    if (stats[a].played !== stats[b].played) return stats[a].played - stats[b].played;
    return a.localeCompare(b);
  });
}

function getFallbackPlacements(tournament: Tournament): TournamentPlacements {
  const ranking = (tournament.playerRanking ?? []).filter(isPlayerId);
  const standings = getRoundRobinRanking(tournament);
  const orderedPlayers = ranking.length > 0
    ? [...ranking, ...standings.filter(playerId => !ranking.includes(playerId))]
    : standings;

  return {
    firstPlaceId: orderedPlayers[0] ?? null,
    secondPlaceId: orderedPlayers[1] ?? null,
    thirdPlaceIds: orderedPlayers[2] ? [orderedPlayers[2]] : [],
  };
}

/**
 * Extracts final placements from a completed tournament.
 *
 * If no bracket exists, the saved player ranking or round-robin standings are
 * used as a fallback. Without a third-place match, both semifinal losers share
 * third place and each receives third-place points.
 */
export function getTournamentPlacements(tournament: Tournament): TournamentPlacements {
  const allMatches = tournament.matches ?? [];
  const bracketMatches = allMatches.filter(match =>
    match.round === 'bracket' && !match.isThirdPlace && bracketRound(match) > 0
  );

  if (bracketMatches.length === 0) return getFallbackPlacements(tournament);

  const hasRoundMetadata = bracketMatches.some(match => match.bracketRound !== undefined);
  const finalRound = hasRoundMetadata ? Math.max(...bracketMatches.map(bracketRound)) : 1;
  const finalRoundMatches = bracketMatches.filter(match => bracketRound(match) === finalRound);
  // A completed single-elimination bracket has exactly one standard match in
  // its last round. Older records without bracketRound are stored in play
  // order, so their final is the last standard bracket match.
  const finalMatch = hasRoundMetadata
    ? finalRoundMatches.length === 1 ? finalRoundMatches[0] : null
    : bracketMatches[bracketMatches.length - 1];
  if (!finalMatch || !isPlayerId(finalMatch.winnerId)) {
    return { firstPlaceId: null, secondPlaceId: null, thirdPlaceIds: [] };
  }

  const firstPlaceId = finalMatch.winnerId;
  const secondPlaceId = getOpponent(finalMatch, firstPlaceId);
  const thirdPlaceMatches = allMatches.filter(match =>
    match.round === 'bracket' && match.isThirdPlace && bracketRound(match) === finalRound
  );
  const completedThirdPlaceMatch = thirdPlaceMatches.find(match => isPlayerId(match.winnerId));

  if (completedThirdPlaceMatch?.winnerId && isPlayerId(completedThirdPlaceMatch.winnerId)) {
    return {
      firstPlaceId,
      secondPlaceId,
      thirdPlaceIds: [completedThirdPlaceMatch.winnerId],
    };
  }

  // An explicitly configured third-place match must be completed before it
  // can award points. Shared third place applies only when no such match was
  // played for the tournament.
  if (thirdPlaceMatches.length > 0) {
    return { firstPlaceId, secondPlaceId, thirdPlaceIds: [] };
  }

  const semifinalMatches = bracketMatches.filter(match => bracketRound(match) === finalRound - 1);
  const sharedThirdPlaceIds = semifinalMatches.length === 2
    ? semifinalMatches.map(getLoser).filter((playerId): playerId is string => Boolean(playerId))
    : [];

  return {
    firstPlaceId,
    secondPlaceId,
    thirdPlaceIds: [...new Set(sharedThirdPlaceIds)],
  };
}

export function validateTournamentPointValues(values: TournamentPointValues): string | null {
  if (
    !Number.isFinite(values.firstPlacePoints) ||
    !Number.isFinite(values.secondPlacePoints) ||
    !Number.isFinite(values.thirdPlacePoints) ||
    values.firstPlacePoints <= 0 ||
    values.secondPlacePoints <= 0 ||
    values.thirdPlacePoints <= 0
  ) {
    return 'Point values must be positive numbers.';
  }

  if (
    values.firstPlacePoints <= values.secondPlacePoints ||
    values.secondPlacePoints <= values.thirdPlacePoints
  ) {
    return 'Points must decrease from 1st place to 2nd place to 3rd place.';
  }

  return null;
}

/** Calculates a points championship across the supplied tournaments. */
export function calculateTournamentPoints(
  tournaments: Tournament[],
  values: TournamentPointValues = DEFAULT_TOURNAMENT_POINT_VALUES,
  doubleLastTournament = false,
): TournamentPointsResult {
  const validationError = validateTournamentPointValues(values);
  if (validationError) throw new Error(validationError);

  const chronologicalTournaments = [...tournaments].sort((a, b) => {
    const dateDifference = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    return dateDifference !== 0 ? dateDifference : a.id.localeCompare(b.id);
  });
  const lastTournamentId = chronologicalTournaments[chronologicalTournaments.length - 1]?.id;
  const entries = new Map<string, TournamentPointsLeaderboardEntry>();

  const ensureEntry = (playerId: string) => {
    if (!entries.has(playerId)) {
      entries.set(playerId, {
        playerId,
        totalPoints: 0,
        firstPlaces: 0,
        secondPlaces: 0,
        thirdPlaces: 0,
        tournamentsPlayed: 0,
      });
    }
    return entries.get(playerId)!;
  };

  chronologicalTournaments.forEach(tournament => {
    tournament.players.filter(isPlayerId).forEach(playerId => {
      ensureEntry(playerId).tournamentsPlayed++;
    });
  });

  const tournamentResults = chronologicalTournaments.map(tournament => {
    const placements = getTournamentPlacements(tournament);
    const multiplier = doubleLastTournament && tournament.id === lastTournamentId ? 2 : 1;
    const firstPlace = placements.firstPlaceId ? ensureEntry(placements.firstPlaceId) : null;
    const secondPlace = placements.secondPlaceId ? ensureEntry(placements.secondPlaceId) : null;

    if (firstPlace) {
      firstPlace.totalPoints += values.firstPlacePoints * multiplier;
      firstPlace.firstPlaces++;
    }
    if (secondPlace) {
      secondPlace.totalPoints += values.secondPlacePoints * multiplier;
      secondPlace.secondPlaces++;
    }
    placements.thirdPlaceIds.forEach(playerId => {
      const thirdPlace = ensureEntry(playerId);
      thirdPlace.totalPoints += values.thirdPlacePoints * multiplier;
      thirdPlace.thirdPlaces++;
    });

    return {
      tournamentId: tournament.id,
      firstPlaceId: placements.firstPlaceId,
      secondPlaceId: placements.secondPlaceId,
      thirdPlaceIds: placements.thirdPlaceIds,
      multiplier,
    };
  });

  const leaderboard = [...entries.values()].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.firstPlaces !== a.firstPlaces) return b.firstPlaces - a.firstPlaces;
    if (b.secondPlaces !== a.secondPlaces) return b.secondPlaces - a.secondPlaces;
    if (b.thirdPlaces !== a.thirdPlaces) return b.thirdPlaces - a.thirdPlaces;
    return a.playerId.localeCompare(b.playerId);
  });

  return {
    winnerId: leaderboard.find(entry => entry.totalPoints > 0)?.playerId ?? null,
    leaderboard,
    tournamentResults,
  };
}
