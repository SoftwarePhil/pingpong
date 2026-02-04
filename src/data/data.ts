import { createClient, RedisClientType } from 'redis';
import { Player, Tournament, Match, Game } from '../types/pingpong';

// Redis client
let redisClient: RedisClientType;

// Redis keys
const PLAYERS_KEY = 'pingpong:players';
const TOURNAMENTS_KEY = 'pingpong:tournaments';
const MATCHES_KEY = 'pingpong:matches';
const GAMES_KEY = 'pingpong:games';

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

// Getters
export async function getPlayers(): Promise<Player[]> {
  try {
    if (!redisClient) await initRedis();

    const data = await redisClient.get(PLAYERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting players:', error);
    return [];
  }
}

export async function getTournaments(): Promise<Tournament[]> {
  try {
    if (!redisClient) await initRedis();

    const data = await redisClient.get(TOURNAMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting tournaments:', error);
    return [];
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

    await redisClient.set(TOURNAMENTS_KEY, JSON.stringify(data));
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