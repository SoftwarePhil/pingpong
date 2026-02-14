import { createClient, RedisClientType } from 'redis';
import { Player, Tournament, Match, Game } from '../types/pingpong';

// Redis client
let redisClient: RedisClientType;

// Redis keys - Hybrid Schema
const PLAYERS_KEY = 'pingpong:players';
const GAMES_KEY = 'pingpong:games';
const MATCHES_KEY = 'pingpong:matches'; // Keep for player stats compatibility
const ACTIVE_TOURNAMENTS_KEY = 'pingpong:active_tournaments';
const COMPLETED_TOURNAMENTS_KEY = 'pingpong:completed_tournaments';

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

// Load data from Redis
export async function loadData() {
  try {
    if (!redisClient) {
      await initRedis();
    }

    // Data is loaded on-demand, no need to preload
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

    // Update indexes
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

    // Update player tournament IDs
    const players = await getPlayers();
    const updatedPlayers = players.map(player => {
      if (tournament.players.includes(player.id)) {
        return {
          ...player,
          tournamentIds: player.tournamentIds.includes(tournament.id)
            ? player.tournamentIds
            : [...player.tournamentIds, tournament.id]
        };
      }
      return player;
    });
    await setPlayers(updatedPlayers);
  } catch (error) {
    console.error('Error setting tournament:', error);
    throw error;
  }
}

export async function deleteTournament(id: string): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    const key = `pingpong:tournament:${id}`;
    const tournament = await getTournament(id);
    if (tournament) {
      // Remove from indexes
      await redisClient.zRem(ACTIVE_TOURNAMENTS_KEY, id);
      await redisClient.zRem(COMPLETED_TOURNAMENTS_KEY, id);

      // Remove tournament ID from player objects
      const players = await getPlayers();
      const updatedPlayers = players.map(player => {
        if (tournament.players.includes(player.id)) {
          return {
            ...player,
            tournamentIds: player.tournamentIds.filter(tId => tId !== id)
          };
        }
        return player;
      });
      await setPlayers(updatedPlayers);
    }
    await redisClient.del(key);
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

    // Parse players with error handling
    let players: Player[];
    try {
      players = JSON.parse(data);
    } catch (parseError) {
      console.error('Error parsing players JSON:', parseError);
      console.error('Raw data:', data);
      return [];
    }

    // Migrate existing players to include tournamentIds field
    const migratedPlayers = players.map((player: Player) => ({
      id: player.id,
      name: player.name,
      tournamentIds: player.tournamentIds || []
    }));

    // Save migrated data back to Redis
    await setPlayers(migratedPlayers);

    return migratedPlayers;
  } catch (error) {
    console.error('Error getting players:', error);
    return [];
  }
}

export async function getTournaments(): Promise<Tournament[]> {
  try {
    if (!redisClient) await initRedis();

    // Get all tournament IDs from both active and completed indexes
    const [activeIds, completedIds] = await Promise.all([
      getActiveTournamentIds(),
      getCompletedTournamentIds()
    ]);

    const allIds = [...activeIds, ...completedIds];

    // Load all tournament documents
    const tournaments = await Promise.all(
      allIds.map(id => getTournament(id))
    );

    return tournaments.filter(t => t !== null) as Tournament[];
  } catch (error) {
    console.error('Error getting tournaments:', error);
    // Fallback to old schema if migration not complete
    try {
      const data = await redisClient.get('pingpong:tournaments');
      return data ? JSON.parse(data) : [];
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      return [];
    }
  }
}

export async function getMatches(): Promise<Match[]> {
  try {
    if (!redisClient) await initRedis();

    const data = await redisClient.get(MATCHES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting matches:', error);
    return [];
  }
}

export async function getGames(): Promise<Game[]> {
  try {
    if (!redisClient) await initRedis();

    const data = await redisClient.get(GAMES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting games:', error);
    return [];
  }
}

// Setters (for replacing entire arrays)
export async function setPlayers(data: Player[]) {
  try {
    if (!redisClient) await initRedis();

    await redisClient.set(PLAYERS_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error setting players:', error);
    throw error;
  }
}

export async function setTournaments(data: Tournament[]) {
  try {
    if (!redisClient) await initRedis();

    // Migrate to new schema: save each tournament as individual document
    await Promise.all(data.map(tournament => setTournament(tournament)));

    // Keep old format for backward compatibility during migration
    await redisClient.set('pingpong:tournaments', JSON.stringify(data));
  } catch (error) {
    console.error('Error setting tournaments:', error);
    throw error;
  }
}

export async function setMatches(data: Match[]) {
  try {
    if (!redisClient) await initRedis();

    await redisClient.set(MATCHES_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error setting matches:', error);
    throw error;
  }
}

export async function setGames(data: Game[]) {
  try {
    if (!redisClient) await initRedis();

    await redisClient.set(GAMES_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error setting games:', error);
    throw error;
  }
}

// Initialize on module load
loadData().catch(console.error);