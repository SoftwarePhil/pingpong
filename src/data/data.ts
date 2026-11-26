import { createClient, RedisClientType, WatchError } from 'redis';
import { MongoClient, Db, Collection } from 'mongodb';
import { Club, Player, Tournament, Match, Game, RoundRobinFormat } from '../types/pingpong';
import { cascadeBracketOutcomeChange, setRoundRobinFormat } from '../lib/tournament';
import { getMatchSides, isDoublesMatch } from '../lib/matchFormat';
import { reject, TournamentChangeRejected, TournamentConflictError, TournamentNotFoundError } from '../lib/tournamentErrors';

export { TournamentChangeRejected, TournamentConflictError, TournamentNotFoundError };

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
const TOURNAMENTS_COLLECTION = 'tournaments';
const CLUBS_COLLECTION = 'clubs';

type PlayerDoc = Omit<Player, 'id'> & { _id: string };
type GameDoc = Omit<Game, 'id'> & { _id: string };
type TournamentDoc = Omit<Tournament, 'id'> & { _id: string };
type ClubDoc = Omit<Club, 'id'> & { _id: string };

// Database name is environment-scoped (e.g. pingpong_test, pingpong_development, pingpong_production)
export function dbName(): string {
  return `pingpong_${ENV_PREFIX}`;
}

async function initMongo() {
  try {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
    const isAtlas = mongoUrl.includes('mongodb+srv') || mongoUrl.includes('mongodb.net');
    mongoClient = new MongoClient(mongoUrl, isAtlas ? { tls: true, tlsAllowInvalidCertificates: false } : {});
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

function tournamentsCol(): Collection<TournamentDoc> {
  return db.collection<TournamentDoc>(TOURNAMENTS_COLLECTION);
}

function clubsCol(): Collection<ClubDoc> {
  return db.collection<ClubDoc>(CLUBS_COLLECTION);
}

// ─────────────────────────────────────────────────────────────────────────────
// Clubs — MongoDB
// ─────────────────────────────────────────────────────────────────────────────

function clubFromDoc({ _id, ...club }: ClubDoc): Club {
  return { id: _id, ...club };
}

export async function getClubBySlug(slug: string): Promise<Club | null> {
  if (!db) await initMongo();
  const doc = await clubsCol().findOne({ slug });
  return doc && clubFromDoc(doc);
}

export async function getClubById(id: string): Promise<Club | null> {
  if (!db) await initMongo();
  const doc = await clubsCol().findOne({ _id: id });
  return doc && clubFromDoc(doc);
}

/** Changes a club's public details. The slug stays fixed so its links keep working. */
export async function updateClub(id: string, fields: { name: string; about: string }): Promise<Club | null> {
  if (!db) await initMongo();
  const doc = await clubsCol().findOneAndUpdate({ _id: id }, { $set: fields }, { returnDocument: 'after' });
  return doc && clubFromDoc(doc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

// Rebuild the Redis match index from all tournament documents (runs on startup to self-heal)
async function migrateMatchIndex() {
  try {
    const tournaments = await readTournaments();
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

/** The MongoDB database, connecting on first use. For data modules outside this file. */
export async function getMongoDb(): Promise<Db> {
  if (!db) await initMongo();
  return db;
}

/** The Redis client, connecting on first use. For data modules outside this file. */
export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) await initRedis();
  return redisClient;
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

// ─────────────────────────────────────────────────────────────────────────────
// Tournament functions — Redis (real-time state)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTournament(id: string): Promise<Tournament | null> {
  try {
    if (!redisClient) await initRedis();
    // Active tournaments are in Redis
    const data = await redisClient.get(tournamentKey(id));
    if (data) return JSON.parse(data);
    // Completed tournaments are in MongoDB
    if (!db) await initMongo();
    const doc = await tournamentsCol().findOne({ _id: id });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { id: _id, ...rest } as Tournament;
  } catch (error) {
    console.error('Error getting tournament:', error);
    return null;
  }
}

/** Saves a brand-new tournament and registers its matches, in one Redis transaction. */
export async function createTournament(tournament: Tournament): Promise<Tournament> {
  if (!redisClient) await initRedis();
  const created: Tournament = { ...tournament, version: tournament.version ?? 1 };
  const entries = matchIndexEntries(created.matches ?? []);
  if (created.status === 'completed') {
    // Only seeding and tests create a tournament that is already finished.
    if (!db) await initMongo();
    const { id, ...doc } = created;
    await tournamentsCol().replaceOne({ _id: id }, doc, { upsert: true });
    if (Object.keys(entries).length > 0) await redisClient.hSet(MATCH_INDEX_KEY, entries);
    return created;
  }
  const transaction = redisClient.multi()
    .set(tournamentKey(created.id), JSON.stringify(created))
    .zAdd(ACTIVE_TOURNAMENTS_KEY, { score: new Date(created.startDate).getTime(), value: created.id });
  if (Object.keys(entries).length > 0) transaction.hSet(MATCH_INDEX_KEY, entries);
  await transaction.exec();
  return created;
}

function matchIndexEntries(matches: Match[]): Record<string, string> {
  return Object.fromEntries(matches.map(match => [match.id, match.tournamentId]));
}

/** Match ids that a change added and removed, so the match index can follow it. */
function diffMatches(before: Tournament, after: Tournament): { added: Match[]; removedIds: string[] } {
  const beforeIds = new Set((before.matches ?? []).map(match => match.id));
  const afterIds = new Set((after.matches ?? []).map(match => match.id));
  return {
    added: (after.matches ?? []).filter(match => !beforeIds.has(match.id)),
    removedIds: [...beforeIds].filter(id => !afterIds.has(id)),
  };
}

const MAX_MUTATION_ATTEMPTS = 8;

/**
 * Changes waiting on each tournament in this process. Changes to one
 * tournament run one at a time here, so requests on the same server never
 * race each other; WATCH only has to catch other servers.
 */
const tournamentQueues = new Map<string, Promise<unknown>>();

function inTournamentQueue<R>(tournamentId: string, run: () => Promise<R>): Promise<R> {
  const previous = tournamentQueues.get(tournamentId) ?? Promise.resolve();
  const result = previous.then(run, run);
  const tail = result.then(() => undefined, () => undefined);
  tournamentQueues.set(tournamentId, tail);
  void tail.then(() => {
    if (tournamentQueues.get(tournamentId) === tail) tournamentQueues.delete(tournamentId);
  });
  return result;
}

/** A short, growing, jittered pause so two retrying requests stop colliding. */
function retryPause(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, attempt * 10 + Math.random() * 20));
}

export type TournamentChange<T> = (tournament: Tournament) => T | Promise<T>;

/**
 * The one way to change a saved tournament. Reads it, runs `change` on a fresh
 * copy, and saves the result only if nobody else saved the tournament in the
 * meantime; otherwise it reads again and reruns `change`, up to 8 times, then
 * throws TournamentConflictError. Changes to one tournament from this process
 * queue behind each other, so only another server can cause a retry.
 *
 * `change` edits the tournament in place and may return a value for the caller.
 * It must have no side effects (it can run more than once): do anything else,
 * such as game history writes, after this returns. Throw from it (see
 * `reject`) to refuse the change; nothing is saved.
 *
 * Every commit bumps `version`, and the match index is updated from the
 * matches the change added or removed. Active tournaments are guarded with
 * Redis WATCH on a dedicated connection (WATCH is per connection); completed
 * ones, which live in MongoDB, with a version check on the write.
 */
export async function mutateTournament<T = void>(
  tournamentId: string,
  change: TournamentChange<T>,
): Promise<{ tournament: Tournament; result: T }> {
  return inTournamentQueue(tournamentId, () => runMutation(tournamentId, change));
}

async function runMutation<T>(
  tournamentId: string,
  change: TournamentChange<T>,
): Promise<{ tournament: Tournament; result: T }> {
  const transactionClient = await takeTransactionClient();
  let reusable = true;
  try {
    for (let attempt = 1; attempt <= MAX_MUTATION_ATTEMPTS; attempt++) {
      const committed = await attemptMutation(transactionClient, tournamentId, change);
      if (committed) return committed;
      if (attempt < MAX_MUTATION_ATTEMPTS) await retryPause(attempt);
    }
    throw new TournamentConflictError(tournamentId);
  } catch (error) {
    // Only keep a connection we know has no WATCH left on it.
    reusable = await transactionClient.unwatch().then(() => true, () => false);
    throw error;
  } finally {
    returnTransactionClient(transactionClient, reusable);
  }
}

/**
 * Idle connections for WATCH transactions. WATCH belongs to a connection, so
 * each change needs one of its own, but opening one costs a few round trips
 * (about 120 ms to a remote Redis). A transaction always ends with no WATCH
 * left, so the connection can be reused for the next change.
 */
const idleTransactionClients: RedisClientType[] = [];
const MAX_IDLE_TRANSACTION_CLIENTS = 4;

async function takeTransactionClient(): Promise<RedisClientType> {
  if (!redisClient) await initRedis();
  while (idleTransactionClients.length > 0) {
    const client = idleTransactionClients.pop()!;
    if (client.isOpen) return client;
  }
  const client = redisClient.duplicate();
  client.on('error', (err) => console.error('Redis transaction client error:', err));
  await client.connect();
  return client;
}

function returnTransactionClient(client: RedisClientType, reusable: boolean) {
  if (reusable && client.isOpen && idleTransactionClients.length < MAX_IDLE_TRANSACTION_CLIENTS) {
    idleTransactionClients.push(client);
    return;
  }
  void client.quit().catch(() => undefined);
}

/** One try at a change. Null means someone else got there first: try again. */
async function attemptMutation<T>(
  client: RedisClientType,
  tournamentId: string,
  change: TournamentChange<T>,
): Promise<{ tournament: Tournament; result: T } | null> {
  const key = tournamentKey(tournamentId);
  // Watch the index too: a change that adds or removes matches rewrites it.
  await client.watch([key, MATCH_INDEX_KEY]);
  let stored: string | null;
  let before: Tournament;
  let tournament: Tournament;
  let result: T;
  try {
    stored = await client.get(key);
    if (!stored) {
      await client.unwatch();
      return mutateCompletedTournament(tournamentId, change);
    }
    before = JSON.parse(stored) as Tournament;
    tournament = JSON.parse(stored) as Tournament;
    result = await change(tournament);
  } catch (error) {
    await client.unwatch().catch(() => undefined);
    throw error;
  }

  tournament.version = (before.version ?? 0) + 1;
  const { added, removedIds } = diffMatches(before, tournament);
  const completing = tournament.status === 'completed';
  if (completing) {
    // Finished tournaments move to MongoDB. Write there first, and only drop
    // the Redis copy once that worked, so a failed write loses nothing.
    if (!db) await initMongo();
    const { id, ...doc } = tournament;
    try {
      await tournamentsCol().replaceOne({ _id: id }, doc, { upsert: true });
    } catch (error) {
      await client.unwatch().catch(() => undefined);
      throw error;
    }
  }

  const transaction = client.multi();
  if (completing) {
    transaction.del(key).zRem(ACTIVE_TOURNAMENTS_KEY, tournamentId);
  } else {
    transaction
      .set(key, JSON.stringify(tournament))
      .zAdd(ACTIVE_TOURNAMENTS_KEY, { score: new Date(tournament.startDate).getTime(), value: tournamentId });
  }
  if (removedIds.length > 0) transaction.hDel(MATCH_INDEX_KEY, removedIds);
  if (added.length > 0) transaction.hSet(MATCH_INDEX_KEY, matchIndexEntries(added));

  try {
    const replies = await transaction.exec();
    const commandError = replies.find(reply => reply instanceof Error);
    if (commandError instanceof Error) throw commandError;
  } catch (error) {
    if (error instanceof WatchError) {
      // Lost the race. Take back the MongoDB copy written above, unless a
      // newer one has replaced it, and let the caller try again.
      if (completing) {
        await tournamentsCol().deleteOne({ _id: tournamentId, version: tournament.version }).catch(() => undefined);
      }
      return null;
    }
    throw error;
  }
  return { tournament, result };
}

/** A change to a finished tournament, which lives in MongoDB rather than Redis. */
async function mutateCompletedTournament<T>(
  tournamentId: string,
  change: TournamentChange<T>,
): Promise<{ tournament: Tournament; result: T } | null> {
  if (!db) await initMongo();
  const doc = await tournamentsCol().findOne({ _id: tournamentId });
  if (!doc) throw new TournamentNotFoundError(tournamentId);
  const { _id, ...fields } = doc;
  const before = { id: _id, ...fields } as Tournament;
  const tournament = structuredClone(before);
  const result = await change(tournament);
  if (tournament.status !== 'completed') {
    throw new TournamentChangeRejected('A completed tournament cannot be reopened');
  }
  tournament.version = (before.version ?? 0) + 1;
  const { id, ...replacement } = tournament;
  // Only replace the copy we read. A tournament saved before versions existed
  // has no version field.
  const sameVersion = before.version === undefined
    ? { _id: id, version: { $exists: false } }
    : { _id: id, version: before.version };
  const written = await tournamentsCol().replaceOne(sameVersion, replacement);
  if (written.matchedCount === 0) return null;
  const { added, removedIds } = diffMatches(before, tournament);
  if (removedIds.length > 0) await redisClient.hDel(MATCH_INDEX_KEY, removedIds);
  if (added.length > 0) await redisClient.hSet(MATCH_INDEX_KEY, matchIndexEntries(added));
  return { tournament, result };
}

/**
 * Changes the current round-robin round between singles and doubles,
 * replacing that round's unplayed matches.
 */
export async function setRoundRobinFormatAtomically(
  tournamentId: string,
  requestedRound: number,
  format: RoundRobinFormat,
): Promise<Tournament> {
  const { tournament } = await mutateTournament(tournamentId, tournament => {
    const bracketStarted = Boolean(
      tournament.bracketStartedAt ||
      (tournament.matches ?? []).some(match => match.round === 'bracket') ||
      tournament.status === 'bracket' ||
      tournament.status === 'completed'
    );
    if (bracketStarted || tournament.status !== 'roundRobin') {
      reject('Round format can only be changed during the round robin stage');
    }

    const rrMatches = (tournament.matches ?? []).filter(match => match.round === 'roundRobin');
    const currentRound = rrMatches.length > 0
      ? Math.max(...rrMatches.map(match => match.bracketRound ?? 1))
      : 1;
    if (!Number.isInteger(requestedRound) || requestedRound !== currentRound) {
      reject('Only the current round format can be changed');
    }

    try {
      setRoundRobinFormat(tournament, format);
    } catch (error) {
      // Its errors explain why the format can't change, for the admin to read.
      if (error instanceof Error) reject(error.message);
      throw error;
    }
  });
  return tournament;
}

// Update player → tournament ID references in MongoDB.
// Call this only when tournament.players changes (creation, player add/remove).
export async function syncTournamentPlayers(tournament: Tournament): Promise<void> {
  try {
    if (!db) await initMongo();
    const players = await getPlayers(tournament.clubId);
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
      await removeGamesFromHistory((tournament.matches ?? []).flatMap(m => m.games.map(g => g.id)));
      await redisClient.zRem(ACTIVE_TOURNAMENTS_KEY, id);
      const matchIds = (tournament.matches ?? []).map(m => m.id);
      if (matchIds.length > 0) {
        await redisClient.hDel(MATCH_INDEX_KEY, matchIds);
      }
      // Update player tournamentIds in MongoDB
      const players = await getPlayers(tournament.clubId);
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
    // Remove from Redis (active) and MongoDB (completed) — only one will have it
    await redisClient.del(tournamentKey(id));
    if (!db) await initMongo();
    await tournamentsCol().deleteOne({ _id: id });
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

// Getters
export function getTournaments(clubId: string): Promise<Tournament[]> {
  return readTournaments(clubId);
}

/** One club's tournaments, or every club's when `clubId` is left out (startup housekeeping only). */
async function readTournaments(clubId?: string): Promise<Tournament[]> {
  try {
    if (!redisClient) await initRedis();
    if (!db) await initMongo();
    // Active tournaments: IDs from Redis sorted set, documents from Redis
    const activeIds = await getActiveTournamentIds();
    const active = (await Promise.all(activeIds.map(id => getTournament(id))))
      .filter((t): t is Tournament => t !== null && (clubId === undefined || t.clubId === clubId));
    // Completed tournaments: documents directly from MongoDB
    const completedDocs = await tournamentsCol()
      .find({ status: 'completed', ...(clubId !== undefined && { clubId }) })
      .sort({ startDate: 1 })
      .toArray();
    // A tournament being completed is briefly in both stores (mutateTournament
    // writes MongoDB before it drops the Redis copy), so list it once.
    const activeIdSet = new Set(active.map(t => t.id));
    const completed = completedDocs
      .map(({ _id, ...rest }) => ({ id: _id, ...rest } as Tournament))
      .filter(t => !activeIdSet.has(t.id));
    return [...active, ...completed];
  } catch (error) {
    console.error('Error getting tournaments:', error);
    return [];
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

// ─────────────────────────────────────────────────────────────────────────────
// Player functions — MongoDB (durable, long-term)
// ─────────────────────────────────────────────────────────────────────────────

export async function getPlayers(clubId: string): Promise<Player[]> {
  try {
    if (!db) await initMongo();
    const docs = await playersCol().find({ clubId }).toArray();
    return docs.map(({ _id, ...player }) => ({
      id: _id,
      clubId: player.clubId,
      name: player.name,
      tournamentIds: player.tournamentIds ?? [],
      ...(player.firstName !== undefined && { firstName: player.firstName }),
      ...(player.lastName !== undefined && { lastName: player.lastName }),
      ...(player.birthday !== undefined && { birthday: player.birthday }),
      ...(player.profilePicture !== undefined && { profilePicture: player.profilePicture }),
      ...(player.createdAt !== undefined && { createdAt: player.createdAt }),
    }));
  } catch (error) {
    console.error('Error getting players:', error);
    return [];
  }
}

export async function setPlayers(data: Player[]): Promise<void> {
  try {
    if (!db) await initMongo();
    if (data.length === 0) return;
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

export async function getAllMatches(clubId: string): Promise<Match[]> {
  try {
    const tournaments = await getTournaments(clubId);
    return tournaments.flatMap(t => t.matches ?? []);
  } catch (error) {
    console.error('Error getting all matches:', error);
    return [];
  }
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

export async function removeMatchFromTournament(
  matchId: string
): Promise<{ match: Match; tournament: Tournament } | null> {
  const tournamentId = await getTournamentIdForMatch(matchId);
  if (!tournamentId) return null;
  const { tournament, result: match } = await mutateTournament(tournamentId, tournament => {
    const matches = [...(tournament.matches ?? [])];
    const [match] = matches.splice(matchIndexIn(tournament, matchId), 1);
    tournament.matches = matches;
    return match;
  });
  await removeGamesFromHistory(match.games.map(g => g.id));
  return { match, tournament };
}

// ─────────────────────────────────────────────────────────────────────────────
// Game functions — Redis (live state in tournament) + MongoDB (historical record)
// ─────────────────────────────────────────────────────────────────────────────

export function recalculateMatchWinner(match: Match): Match {
  const p1Wins = match.games.filter(g => g.score1 > g.score2).length;
  const p2Wins = match.games.filter(g => g.score2 > g.score1).length;
  const requiredWins = Math.ceil(match.bestOf / 2);
  if (isDoublesMatch(match)) {
    if (p1Wins >= requiredWins) return { ...match, winnerId: undefined, winnerSide: 1 };
    if (p2Wins >= requiredWins) return { ...match, winnerId: undefined, winnerSide: 2 };
    return { ...match, winnerId: undefined, winnerSide: undefined };
  }
  if (p1Wins >= requiredWins) return { ...match, winnerId: match.player1Id, winnerSide: undefined };
  if (p2Wins >= requiredWins) return { ...match, winnerId: match.player2Id, winnerSide: undefined };
  return { ...match, winnerId: undefined, winnerSide: undefined };
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

// Bulk variant of removeGameHistory — used when a bracket correction cascade
// invalidates games on downstream matches.
export async function removeGamesFromHistory(gameIds: string[]): Promise<void> {
  if (gameIds.length === 0) return;
  try {
    if (!db) await initMongo();
    await gamesCol().deleteMany({ _id: { $in: gameIds } });
  } catch (error) {
    console.warn(`Failed to bulk-remove games from MongoDB history:`, error);
  }
}

// getAllGames reads from the MongoDB games collection (durable history)
export async function getAllGames(clubId: string): Promise<Game[]> {
  try {
    if (!db) await initMongo();
    const docs = await gamesCol().find({ clubId }).toArray();
    return docs.map(({ _id, ...game }) => ({ id: _id, ...game } as Game));
  } catch (error) {
    console.error('Error getting all games:', error);
    return [];
  }
}

/**
 * The match `matchId` inside the tournament being changed. Refuses the change
 * with a 404 if another request removed it in the meantime.
 */
function matchIndexIn(tournament: Tournament, matchId: string): number {
  const index = (tournament.matches ?? []).findIndex(m => m.id === matchId);
  if (index === -1) reject('Match not found', 404);
  return index;
}

function bracketHasStarted(tournament: Tournament): boolean {
  return Boolean(
    tournament.bracketStartedAt ||
    (tournament.matches ?? []).some(m => m.round === 'bracket') ||
    tournament.status === 'bracket'
  );
}

/** Round-robin games are frozen once the bracket starts. */
function assertRoundRobinOpen(tournament: Tournament, match: Match, verb: 'record' | 'edit' | 'delete') {
  if (match.round === 'roundRobin' && bracketHasStarted(tournament)) {
    reject(`Cannot ${verb} round robin games after bracket has started`);
  }
}

/**
 * Sets `match` into the tournament and, for a bracket match, carries a changed
 * winner forward into the next round (see cascadeBracketOutcomeChange).
 * Returns the match as saved and the downstream games that were cleared.
 */
export function placeMatch(tournament: Tournament, match: Match): { match: Match; invalidatedGameIds: string[] } {
  const matches = [...(tournament.matches ?? [])];
  matches[matchIndexIn(tournament, match.id)] = match;
  tournament.matches = matches;
  if (match.round !== 'bracket') return { match, invalidatedGameIds: [] };
  const cascaded = cascadeBracketOutcomeChange(matches, match.id);
  tournament.matches = cascaded.matches;
  return {
    match: cascaded.matches.find(m => m.id === match.id) ?? match,
    invalidatedGameIds: cascaded.invalidatedGameIds,
  };
}

/** A game as stored for `match`: doubles games carry both sides' players. */
function gameForMatch(game: Game, match: Match): Game {
  if (!isDoublesMatch(match)) return game;
  const [side1, side2] = getMatchSides(match);
  return { ...game, player1Id: side1[0], player2Id: side2[0], side1PlayerIds: side1, side2PlayerIds: side2 };
}

export async function addGameToMatch(
  game: Game
): Promise<{ match: Match; tournament: Tournament } | null> {
  if (!game.matchId) return null;
  const matchId = game.matchId;
  const tournamentId = await getTournamentIdForMatch(matchId);
  if (!tournamentId) return null;
  const { tournament, result } = await mutateTournament(tournamentId, tournament => {
    const match = tournament.matches![matchIndexIn(tournament, matchId)];
    assertRoundRobinOpen(tournament, match, 'record');
    const persistedGame = gameForMatch(game, match);
    const placed = placeMatch(tournament, recalculateMatchWinner({ ...match, games: [...match.games, persistedGame] }));
    return { ...placed, persistedGame };
  });
  await removeGamesFromHistory(result.invalidatedGameIds);
  await persistGameHistory(result.persistedGame);
  return { match: result.match, tournament };
}

export async function updateGameInMatch(
  updatedGame: Game
): Promise<{ match: Match; tournament: Tournament } | null> {
  if (!updatedGame.matchId) return null;
  const matchId = updatedGame.matchId;
  const tournamentId = await getTournamentIdForMatch(matchId);
  if (!tournamentId) return null;
  const { tournament, result } = await mutateTournament(tournamentId, tournament => {
    const match = tournament.matches![matchIndexIn(tournament, matchId)];
    assertRoundRobinOpen(tournament, match, 'edit');
    if (!match.games.some(g => g.id === updatedGame.id)) reject('Game not found', 404);
    const persistedGame = gameForMatch(updatedGame, match);
    const games = match.games.map(g => g.id === updatedGame.id ? persistedGame : g);
    const placed = placeMatch(tournament, recalculateMatchWinner({ ...match, games }));
    return { ...placed, persistedGame };
  });
  await removeGamesFromHistory(result.invalidatedGameIds);
  // Keep MongoDB history in sync
  await persistGameHistory(result.persistedGame);
  return { match: result.match, tournament };
}

export async function removeGameFromMatch(
  gameId: string,
  matchId: string
): Promise<{ game: Game; match: Match } | null> {
  const tournamentId = await getTournamentIdForMatch(matchId);
  if (!tournamentId) return null;
  const { result } = await mutateTournament(tournamentId, tournament => {
    const match = tournament.matches![matchIndexIn(tournament, matchId)];
    assertRoundRobinOpen(tournament, match, 'delete');
    const game = match.games.find(g => g.id === gameId) ?? reject('Game not found', 404);
    const placed = placeMatch(tournament, recalculateMatchWinner({
      ...match,
      games: match.games.filter(g => g.id !== gameId),
    }));
    return { ...placed, game };
  });
  await removeGamesFromHistory(result.invalidatedGameIds);
  // Remove from MongoDB history
  await removeGameHistory(gameId);
  return { game: result.game, match: result.match };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export — every stored record, for admins to download
// ─────────────────────────────────────────────────────────────────────────────

export interface DataExport {
  /** Bumped when the file's shape changes, so older exports can still be read. */
  formatVersion: 1;
  exportedAt: string;
  environment: string;
  counts: { clubs: number; players: number; tournaments: number; activeTournaments: number; games: number };
  clubs: Club[];
  players: Player[];
  /** Active tournaments (from Redis) first, then completed ones (from MongoDB). */
  tournaments: Tournament[];
  /** The MongoDB game history; games are also embedded in their tournament's matches. */
  games: Game[];
}

function withId<T extends { _id: string }>({ _id, ...rest }: T) {
  return { id: _id, ...rest };
}

/**
 * Reads a club's players, tournaments and games exactly as stored. Unlike the
 * read helpers above it does not swallow errors: a failed read must fail the
 * export rather than produce a file that silently has missing records.
 */
export async function exportClubData(clubId: string): Promise<DataExport> {
  if (!redisClient) await initRedis();
  if (!db) await initMongo();

  const [clubDocs, playerDocs, gameDocs, completedDocs, activeIds] = await Promise.all([
    clubsCol().find({ _id: clubId }).toArray(),
    playersCol().find({ clubId }).sort({ _id: 1 }).toArray(),
    gamesCol().find({ clubId }).sort({ date: 1 }).toArray(),
    tournamentsCol().find({ clubId }).sort({ startDate: 1 }).toArray(),
    redisClient.zRange(ACTIVE_TOURNAMENTS_KEY, 0, -1),
  ]);
  const activeDocs = await Promise.all(activeIds.map(id => redisClient.get(tournamentKey(id))));
  const active = activeDocs
    .filter((doc): doc is string => doc !== null)
    .map(doc => JSON.parse(doc) as Tournament)
    .filter(tournament => tournament.clubId === clubId);

  const clubs = clubDocs.map(withId) as Club[];
  const players = playerDocs.map(withId) as Player[];
  const tournaments = [...active, ...(completedDocs.map(withId) as Tournament[])];
  const games = gameDocs.map(withId) as Game[];

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    environment: ENV_PREFIX,
    counts: {
      clubs: clubs.length,
      players: players.length,
      tournaments: tournaments.length,
      activeTournaments: active.length,
      games: games.length,
    },
    clubs,
    players,
    tournaments,
    games,
  };
}

// Initialize on module load
loadData().catch(console.error);
