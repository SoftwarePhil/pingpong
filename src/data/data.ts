import { createClient, RedisClientType } from 'redis';
import { Player, Tournament, Match, Game } from '../types/pingpong';

// Redis client
let redisClient: RedisClientType;

// Redis keys
const PLAYERS_KEY = 'pingpong:players';
const ACTIVE_TOURNAMENTS_KEY = 'pingpong:active_tournaments';
const COMPLETED_TOURNAMENTS_KEY = 'pingpong:completed_tournaments';
const MATCH_INDEX_KEY = 'pingpong:match_index'; // Hash: matchId → tournamentId

// Initialize Redis client
async function initRedis() {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
}

// Rebuild the match index from all tournament documents (runs on startup to self-heal)
async function migrateMatchIndex() {
  try {
    const tournaments = await getTournaments();
    if (tournaments.length === 0) return;
    const entries: Record<string, string> = {};
    for (const tournament of tournaments) {
      for (const match of tournament.matches ?? []) {
        entries[match.id] = tournament.id;
      }
    }
    if (Object.keys(entries).length > 0) {
      await redisClient.hSet(MATCH_INDEX_KEY, entries);
    }
    console.log(`Match index rebuilt: ${Object.keys(entries).length} entries`);
  } catch (error) {
    console.warn('Could not rebuild match index:', error);
  }
}

// Load data from Redis
export async function loadData() {
  try {
    if (!redisClient) {
      await initRedis();
    }
    // Rebuild match index from existing embedded tournament data
    await migrateMatchIndex();
    console.log('Redis data layer initialized');
  } catch (error) {
    console.error('Error initializing Redis:', error);
    throw error;
  }
}

// Save data to Redis (no-op since we save immediately on changes)
export async function saveData() {
  // Redis saves immediately, so this is a no-op
  console.log('Data saved to Redis');
}

// Tournament document functions (new hybrid schema)
export async function getTournament(id: string): Promise<Tournament | null> {
  try {
    if (!redisClient) await initRedis();
    const key = `pingpong:tournament:${id}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting tournament:', error);
    return null;
  }
}

export async function setTournament(tournament: Tournament): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    const key = `pingpong:tournament:${tournament.id}`;
    await redisClient.set(key, JSON.stringify(tournament));

    // Update active/completed indexes
    if (tournament.status === 'completed') {
      await redisClient.zAdd(COMPLETED_TOURNAMENTS_KEY, {
        score: new Date(tournament.startDate).getTime(),
        value: tournament.id
      });
      await redisClient.zRem(ACTIVE_TOURNAMENTS_KEY, tournament.id);
    } else {
      await redisClient.zAdd(ACTIVE_TOURNAMENTS_KEY, {
        score: new Date(tournament.startDate).getTime(),
        value: tournament.id
      });
      await redisClient.zRem(COMPLETED_TOURNAMENTS_KEY, tournament.id);
    }
  } catch (error) {
    console.error('Error setting tournament:', error);
    throw error;
  }
}

// Update player → tournament ID references.
// Call this only when tournament.players changes (creation, player add/remove).
export async function syncTournamentPlayers(tournament: Tournament): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    const players = await getPlayers();
    const updatedPlayers = players.map(player => {
      if (tournament.players.includes(player.id)) {
        return {
          ...player,
          tournamentIds: player.tournamentIds.includes(tournament.id)
            ? player.tournamentIds
            : [...player.tournamentIds, tournament.id],
        };
      }
      return player;
    });
    await setPlayers(updatedPlayers);
  } catch (error) {
    console.error('Error syncing tournament players:', error);
    throw error;
  }
}

export async function deleteTournament(id: string): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    const tournament = await getTournament(id);
    if (tournament) {
      // Remove from active/completed indexes
      await redisClient.zRem(ACTIVE_TOURNAMENTS_KEY, id);
      await redisClient.zRem(COMPLETED_TOURNAMENTS_KEY, id);

      // Remove all match index entries for this tournament
      const matchIds = (tournament.matches ?? []).map(m => m.id);
      if (matchIds.length > 0) {
        await redisClient.hDel(MATCH_INDEX_KEY, matchIds);
      }

      // Remove tournament ID from player objects
      const players = await getPlayers();
      const updatedPlayers = players.map(player => {
        if (tournament.players.includes(player.id)) {
          return {
            ...player,
            tournamentIds: player.tournamentIds.filter(tId => tId !== id),
          };
        }
        return player;
      });
      await setPlayers(updatedPlayers);
    }
    await redisClient.del(`pingpong:tournament:${id}`);
  } catch (error) {
    console.error('Error deleting tournament:', error);
    throw error;
  }
}

export async function getActiveTournamentIds(): Promise<string[]> {
  try {
    if (!redisClient) await initRedis();
    const result = await redisClient.zRange(ACTIVE_TOURNAMENTS_KEY, 0, -1);
    return result;
  } catch (error) {
    console.error('Error getting active tournament IDs:', error);
    return [];
  }
}

export async function getCompletedTournamentIds(): Promise<string[]> {
  try {
    if (!redisClient) await initRedis();
    const result = await redisClient.zRange(COMPLETED_TOURNAMENTS_KEY, 0, -1);
    return result;
  } catch (error) {
    console.error('Error getting completed tournament IDs:', error);
    return [];
  }
}

// Getters
export async function getPlayers(): Promise<Player[]> {
  try {
    if (!redisClient) await initRedis();
    const data = await redisClient.get(PLAYERS_KEY);
    if (!data) return [];
    let players: Player[];
    try {
      players = JSON.parse(data);
    } catch (parseError) {
      console.error('Error parsing players JSON:', parseError);
      return [];
    }
    // Ensure all players have the tournamentIds field (non-destructive, no write-back)
    return players.map((player: Player) => ({
      id: player.id,
      name: player.name,
      tournamentIds: player.tournamentIds ?? [],
    }));
  } catch (error) {
    console.error('Error getting players:', error);
    return [];
  }
}

export async function getTournaments(): Promise<Tournament[]> {
  try {
    if (!redisClient) await initRedis();
    const [activeIds, completedIds] = await Promise.all([
      getActiveTournamentIds(),
      getCompletedTournamentIds(),
    ]);
    const allIds = [...activeIds, ...completedIds];
    const tournaments = await Promise.all(allIds.map(id => getTournament(id)));
    return tournaments.filter((t): t is Tournament => t !== null);
  } catch (error) {
    console.error('Error getting tournaments:', error);
    return [];
  }
}

export async function setPlayers(data: Player[]): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    await redisClient.set(PLAYERS_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error setting players:', error);
    throw error;
  }
}

export async function setTournaments(data: Tournament[]): Promise<void> {
  try {
    await Promise.all(data.map(t => setTournament(t)));
  } catch (error) {
    console.error('Error setting tournaments:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Match index — fast O(1) matchId → tournamentId lookup
// ─────────────────────────────────────────────────────────────────────────────

export async function getTournamentIdForMatch(matchId: string): Promise<string | null> {
  try {
    if (!redisClient) await initRedis();
    return (await redisClient.hGet(MATCH_INDEX_KEY, matchId)) ?? null;
  } catch (error) {
    console.error('Error getting tournament ID for match:', error);
    return null;
  }
}

export async function registerMatchIndex(matchId: string, tournamentId: string): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    await redisClient.hSet(MATCH_INDEX_KEY, matchId, tournamentId);
  } catch (error) {
    console.error('Error registering match index:', error);
    throw error;
  }
}

export async function unregisterMatchIndex(matchId: string): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    await redisClient.hDel(MATCH_INDEX_KEY, matchId);
  } catch (error) {
    console.error('Error unregistering match index:', error);
    throw error;
  }
}

// Bulk-register multiple matches in the index (used when creating many matches at once)
export async function registerMatchesIndex(matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  try {
    if (!redisClient) await initRedis();
    const entries: Record<string, string> = {};
    for (const m of matches) {
      entries[m.id] = m.tournamentId;
    }
    await redisClient.hSet(MATCH_INDEX_KEY, entries);
  } catch (error) {
    console.error('Error bulk-registering match index:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Match functions — stored inside tournament documents (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllMatches(): Promise<Match[]> {
  try {
    const tournaments = await getTournaments();
    return tournaments.flatMap(t => t.matches ?? []);
  } catch (error) {
    console.error('Error getting all matches:', error);
    return [];
  }
}

export async function getMatchesForTournament(tournamentId: string): Promise<Match[]> {
  const tournament = await getTournament(tournamentId);
  return tournament?.matches ?? [];
}

export async function getMatch(matchId: string): Promise<Match | null> {
  try {
    const tournamentId = await getTournamentIdForMatch(matchId);
    if (!tournamentId) return null;
    const tournament = await getTournament(tournamentId);
    return tournament?.matches?.find(m => m.id === matchId) ?? null;
  } catch (error) {
    console.error('Error getting match:', error);
    return null;
  }
}

export async function addMatchToTournament(match: Match): Promise<void> {
  try {
    const tournament = await getTournament(match.tournamentId);
    if (!tournament) throw new Error(`Tournament ${match.tournamentId} not found`);
    if (!tournament.matches) tournament.matches = [];
    tournament.matches.push(match);
    await setTournament(tournament);
    await registerMatchIndex(match.id, match.tournamentId);
  } catch (error) {
    console.error('Error adding match to tournament:', error);
    throw error;
  }
}

export async function updateMatchInTournament(updatedMatch: Match): Promise<Tournament | null> {
  try {
    const tournamentId = await getTournamentIdForMatch(updatedMatch.id);
    if (!tournamentId) return null;
    const tournament = await getTournament(tournamentId);
    if (!tournament?.matches) return null;
    const idx = tournament.matches.findIndex(m => m.id === updatedMatch.id);
    if (idx === -1) return null;
    tournament.matches[idx] = updatedMatch;
    await setTournament(tournament);
    return tournament;
  } catch (error) {
    console.error('Error updating match in tournament:', error);
    throw error;
  }
}

export async function removeMatchFromTournament(
  matchId: string
): Promise<{ match: Match; tournament: Tournament } | null> {
  try {
    const tournamentId = await getTournamentIdForMatch(matchId);
    if (!tournamentId) return null;
    const tournament = await getTournament(tournamentId);
    if (!tournament?.matches) return null;
    const idx = tournament.matches.findIndex(m => m.id === matchId);
    if (idx === -1) return null;
    const [match] = tournament.matches.splice(idx, 1);
    await setTournament(tournament);
    await unregisterMatchIndex(matchId);
    return { match, tournament };
  } catch (error) {
    console.error('Error removing match from tournament:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Game functions — stored inside match.games inside tournament documents
// ─────────────────────────────────────────────────────────────────────────────

export function recalculateMatchWinner(match: Match): Match {
  const p1Wins = match.games.filter(g => g.score1 > g.score2).length;
  const p2Wins = match.games.filter(g => g.score2 > g.score1).length;
  const requiredWins = Math.ceil(match.bestOf / 2);
  if (p1Wins >= requiredWins) return { ...match, winnerId: match.player1Id };
  if (p2Wins >= requiredWins) return { ...match, winnerId: match.player2Id };
  return { ...match, winnerId: undefined };
}

export async function getAllGames(): Promise<Game[]> {
  try {
    const tournaments = await getTournaments();
    return tournaments.flatMap(t => (t.matches ?? []).flatMap(m => m.games ?? []));
  } catch (error) {
    console.error('Error getting all games:', error);
    return [];
  }
}

export async function addGameToMatch(
  game: Game
): Promise<{ match: Match; tournament: Tournament } | null> {
  try {
    if (!game.matchId) return null;
    const tournamentId = await getTournamentIdForMatch(game.matchId);
    if (!tournamentId) return null;
    const tournament = await getTournament(tournamentId);
    if (!tournament?.matches) return null;
    const matchIdx = tournament.matches.findIndex(m => m.id === game.matchId);
    if (matchIdx === -1) return null;
    tournament.matches[matchIdx] = recalculateMatchWinner({
      ...tournament.matches[matchIdx],
      games: [...tournament.matches[matchIdx].games, game],
    });
    await setTournament(tournament);
    return { match: tournament.matches[matchIdx], tournament };
  } catch (error) {
    console.error('Error adding game to match:', error);
    throw error;
  }
}

export async function updateGameInMatch(
  updatedGame: Game
): Promise<{ match: Match; tournament: Tournament } | null> {
  try {
    if (!updatedGame.matchId) return null;
    const tournamentId = await getTournamentIdForMatch(updatedGame.matchId);
    if (!tournamentId) return null;
    const tournament = await getTournament(tournamentId);
    if (!tournament?.matches) return null;
    const matchIdx = tournament.matches.findIndex(m => m.id === updatedGame.matchId);
    if (matchIdx === -1) return null;
    const games = tournament.matches[matchIdx].games.map(g =>
      g.id === updatedGame.id ? updatedGame : g
    );
    if (!games.some(g => g.id === updatedGame.id)) return null;
    tournament.matches[matchIdx] = recalculateMatchWinner({
      ...tournament.matches[matchIdx],
      games,
    });
    await setTournament(tournament);
    return { match: tournament.matches[matchIdx], tournament };
  } catch (error) {
    console.error('Error updating game in match:', error);
    throw error;
  }
}

export async function removeGameFromMatch(
  gameId: string,
  matchId: string
): Promise<{ game: Game; match: Match } | null> {
  try {
    const tournamentId = await getTournamentIdForMatch(matchId);
    if (!tournamentId) return null;
    const tournament = await getTournament(tournamentId);
    if (!tournament?.matches) return null;
    const matchIdx = tournament.matches.findIndex(m => m.id === matchId);
    if (matchIdx === -1) return null;
    const oldGames = tournament.matches[matchIdx].games;
    const game = oldGames.find(g => g.id === gameId);
    if (!game) return null;
    tournament.matches[matchIdx] = recalculateMatchWinner({
      ...tournament.matches[matchIdx],
      games: oldGames.filter(g => g.id !== gameId),
    });
    await setTournament(tournament);
    return { game, match: tournament.matches[matchIdx] };
  } catch (error) {
    console.error('Error removing game from match:', error);
    throw error;
  }
}

// Initialize on module load
loadData().catch(console.error);