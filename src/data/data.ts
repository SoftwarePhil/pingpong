import { createClient, RedisClientType } from 'redis';
import { MongoClient, Db, Collection } from 'mongodb';
import { Player, Tournament, Match, Game } from '../types/pingpong';

// ─────────────────────────────────────────────────────────────────────────────
// Environment isolation
// ─────────────────────────────────────────────────────────────────────────────
if (!process.env.NODE_ENV) {
  console.warn('NODE_ENV is not set; defaulting to "development". Set NODE_ENV explicitly to ensure correct data isolation.');
}
export const ENV_PREFIX = process.env.NODE_ENV || 'development';

// ─────────────────────────────────────────────────────────────────────────────
// Redis — tournament state (real-time: active tournaments, matches, match index)
// ─────────────────────────────────────────────────────────────────────────────
let redisClient: RedisClientType;

const ACTIVE_TOURNAMENTS_KEY = `${ENV_PREFIX}:pingpong:active_tournaments`;
const COMPLETED_TOURNAMENTS_KEY = `${ENV_PREFIX}:pingpong:completed_tournaments`;
const MATCH_INDEX_KEY = `${ENV_PREFIX}:pingpong:match_index`;

function tournamentKey(id: string): string {
  return `${ENV_PREFIX}:pingpong:tournament:${id}`;
}

async function initRedis() {
  try {
    redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    redisClient.on('error', (err) => console.error('Redis Client Error:', err));
    redisClient.on('connect', () => console.log('Connected to Redis'));
    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MongoDB — players and game history (durable, long-term)
// ─────────────────────────────────────────────────────────────────────────────
let mongoClient: MongoClient;
let db: Db;

const PLAYERS_COLLECTION = 'players';
const GAMES_COLLECTION = 'games';

type PlayerDoc = Omit<Player, 'id'> & { _id: string };
type GameDoc = Omit<Game, 'id'> & { _id: string };

// Database name is environment-scoped (e.g. pingpong_test, pingpong_development, pingpong_production)
export function dbName(): string {
  return `pingpong_${ENV_PREFIX}`;
}

async function initMongo() {
  try {
    mongoClient = new MongoClient(process.env.MONGODB_URL || 'mongodb://localhost:27017');
    mongoClient.on('error', (err) => console.error('MongoDB Client Error:', err));
    await mongoClient.connect();
    db = mongoClient.db(dbName());
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

function playersCol(): Collection<PlayerDoc> {
  return db.collection<PlayerDoc>(PLAYERS_COLLECTION);
}

function gamesCol(): Collection<GameDoc> {
  return db.collection<GameDoc>(GAMES_COLLECTION);
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

// Rebuild the Redis match index from all tournament documents (runs on startup to self-heal)
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

export async function loadData() {
  try {
    if (!redisClient) await initRedis();
    if (!db) await initMongo();
    await migrateMatchIndex();
    console.log('Hybrid data layer initialized (Redis + MongoDB)');
  } catch (error) {
    console.error('Error initializing data layer:', error);
    throw error;
  }
}

// Save data (no-op since both stores save immediately on changes)
export async function saveData() {
  console.log('Data saved (Redis + MongoDB)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tournament functions — Redis (real-time state)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTournament(id: string): Promise<Tournament | null> {
  try {
    if (!redisClient) await initRedis();
    const data = await redisClient.get(tournamentKey(id));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting tournament:', error);
    return null;
  }
}

export async function setTournament(tournament: Tournament): Promise<void> {
  try {
    if (!redisClient) await initRedis();
    await redisClient.set(tournamentKey(tournament.id), JSON.stringify(tournament));
    if (tournament.status === 'completed') {
      await redisClient.zAdd(COMPLETED_TOURNAMENTS_KEY, {
        score: new Date(tournament.startDate).getTime(),
        value: tournament.id,
      });
      await redisClient.zRem(ACTIVE_TOURNAMENTS_KEY, tournament.id);
    } else {
      await redisClient.zAdd(ACTIVE_TOURNAMENTS_KEY, {
        score: new Date(tournament.startDate).getTime(),
        value: tournament.id,
      });
      await redisClient.zRem(COMPLETED_TOURNAMENTS_KEY, tournament.id);
    }
  } catch (error) {
    console.error('Error setting tournament:', error);
    throw error;
  }
}

// Update player → tournament ID references in MongoDB.
// Call this only when tournament.players changes (creation, player add/remove).
export async function syncTournamentPlayers(tournament: Tournament): Promise<void> {
  try {
    if (!db) await initMongo();
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
      await redisClient.zRem(ACTIVE_TOURNAMENTS_KEY, id);
      await redisClient.zRem(COMPLETED_TOURNAMENTS_KEY, id);
      const matchIds = (tournament.matches ?? []).map(m => m.id);
      if (matchIds.length > 0) {
        await redisClient.hDel(MATCH_INDEX_KEY, matchIds);
      }
      // Update player tournamentIds in MongoDB
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
    await redisClient.del(tournamentKey(id));
  } catch (error) {
    console.error('Error deleting tournament:', error);
    throw error;
  }
}

export async function getActiveTournamentIds(): Promise<string[]> {
  try {
    if (!redisClient) await initRedis();
    return await redisClient.zRange(ACTIVE_TOURNAMENTS_KEY, 0, -1);
  } catch (error) {
    console.error('Error getting active tournament IDs:', error);
    return [];
  }
}

export async function getCompletedTournamentIds(): Promise<string[]> {
  try {
    if (!redisClient) await initRedis();
    return await redisClient.zRange(COMPLETED_TOURNAMENTS_KEY, 0, -1);
  } catch (error) {
    console.error('Error getting completed tournament IDs:', error);
    return [];
  }
}

// Getters
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

export async function setTournaments(data: Tournament[]): Promise<void> {
  try {
    await Promise.all(data.map(t => setTournament(t)));
  } catch (error) {
    console.error('Error setting tournaments:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Match index — Redis hash (fast O(1) matchId → tournamentId lookup)
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
// Player functions — MongoDB (durable, long-term)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPlayers(): Promise<Player[]> {
  try {
    if (!db) await initMongo();
    const docs = await playersCol().find({}).toArray();
    return docs.map(({ _id, ...player }) => ({
      id: _id,
      name: player.name,
      tournamentIds: player.tournamentIds ?? [],
    }));
  } catch (error) {
    console.error('Error getting players:', error);
    return [];
  }
}

export async function setPlayers(data: Player[]): Promise<void> {
  try {
    if (!db) await initMongo();
    if (data.length === 0) {
      await playersCol().deleteMany({});
      return;
    }
    const ops = data.map(({ id, ...rest }) => ({
      replaceOne: {
        filter: { _id: id },
        replacement: rest,
        upsert: true,
      },
    }));
    await playersCol().bulkWrite(ops);
  } catch (error) {
    console.error('Error setting players:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Match functions — stored inside tournament documents in Redis
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
// Game functions — Redis (live state in tournament) + MongoDB (historical record)
// ─────────────────────────────────────────────────────────────────────────────

export function recalculateMatchWinner(match: Match): Match {
  const p1Wins = match.games.filter(g => g.score1 > g.score2).length;
  const p2Wins = match.games.filter(g => g.score2 > g.score1).length;
  const requiredWins = Math.ceil(match.bestOf / 2);
  if (p1Wins >= requiredWins) return { ...match, winnerId: match.player1Id };
  if (p2Wins >= requiredWins) return { ...match, winnerId: match.player2Id };
  return { ...match, winnerId: undefined };
}

// Persist a game to MongoDB for long-term history (non-fatal if it fails)
async function persistGameHistory(game: Game): Promise<void> {
  try {
    if (!db) await initMongo();
    const { id, ...doc } = game;
    await gamesCol().replaceOne({ _id: id }, doc, { upsert: true });
  } catch (error) {
    console.warn(`Failed to persist game ${game.id} to MongoDB history:`, error);
  }
}

// Remove a game from MongoDB history (non-fatal if it fails)
async function removeGameHistory(gameId: string): Promise<void> {
  try {
    if (!db) await initMongo();
    await gamesCol().deleteOne({ _id: gameId });
  } catch (error) {
    console.warn(`Failed to remove game ${gameId} from MongoDB history:`, error);
  }
}

// getAllGames reads from the MongoDB games collection (durable history)
export async function getAllGames(): Promise<Game[]> {
  try {
    if (!db) await initMongo();
    const docs = await gamesCol().find({}).toArray();
    return docs.map(({ _id, ...game }) => ({ id: _id, ...game } as Game));
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
    // Persist game to MongoDB history
    await persistGameHistory(game);
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
    // Keep MongoDB history in sync
    await persistGameHistory(updatedGame);
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
    // Remove from MongoDB history
    await removeGameHistory(gameId);
    return { game, match: tournament.matches[matchIdx] };
  } catch (error) {
    console.error('Error removing game from match:', error);
    throw error;
  }
}

// Initialize on module load
loadData().catch(console.error);