import { MongoClient, Db, Collection } from 'mongodb';
import { Player, Tournament, Match, Game } from '../types/pingpong';

// MongoDB client and db
let mongoClient: MongoClient;
let db: Db;

// Environment prefix for MongoDB database name — prevents test/dev data from leaking into production
if (!process.env.NODE_ENV) {
  console.warn('NODE_ENV is not set; MongoDB will use the "development" database. Set NODE_ENV explicitly to ensure correct data isolation.');
}
export const ENV_PREFIX = process.env.NODE_ENV || 'development';

// Database name is environment-scoped (e.g. pingpong_test, pingpong_development, pingpong_production)
export function dbName(): string {
  return `pingpong_${ENV_PREFIX}`;
}

// Collection names
const PLAYERS_COLLECTION = 'players';
const TOURNAMENTS_COLLECTION = 'tournaments';
const MATCH_INDEX_COLLECTION = 'match_index';

// MongoDB document types — use _id in place of the entity's id field
type PlayerDoc = Omit<Player, 'id'> & { _id: string };
type TournamentDoc = Omit<Tournament, 'id'> & { _id: string };
type MatchIndexDoc = { _id: string; tournamentId: string };

// Initialize MongoDB client
async function initMongo() {
  try {
    mongoClient = new MongoClient(process.env.MONGODB_URL || 'mongodb://localhost:27017');

    mongoClient.on('error', (err) => {
      console.error('MongoDB Client Error:', err);
    });

    await mongoClient.connect();
    db = mongoClient.db(dbName());
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

function getDb(): Db {
  return db;
}

function playersCol(): Collection<PlayerDoc> {
  return getDb().collection<PlayerDoc>(PLAYERS_COLLECTION);
}

function tournamentsCol(): Collection<TournamentDoc> {
  return getDb().collection<TournamentDoc>(TOURNAMENTS_COLLECTION);
}

function matchIndexCol(): Collection<MatchIndexDoc> {
  return getDb().collection<MatchIndexDoc>(MATCH_INDEX_COLLECTION);
}

// Rebuild the match index from all tournament documents (runs on startup to self-heal)
async function migrateMatchIndex() {
  try {
    const tournaments = await getTournaments();
    if (tournaments.length === 0) return;
    const ops = tournaments.flatMap(tournament =>
      (tournament.matches ?? []).map(match => ({
        replaceOne: {
          filter: { _id: match.id },
          replacement: { tournamentId: tournament.id },
          upsert: true,
        },
      }))
    );
    if (ops.length > 0) {
      await matchIndexCol().bulkWrite(ops);
    }
    console.log(`Match index rebuilt: ${ops.length} entries`);
  } catch (error) {
    console.warn('Could not rebuild match index:', error);
  }
}

// Load data from MongoDB
export async function loadData() {
  try {
    if (!db) {
      await initMongo();
    }
    // Rebuild match index from existing embedded tournament data
    await migrateMatchIndex();
    console.log('MongoDB data layer initialized');
  } catch (error) {
    console.error('Error initializing MongoDB:', error);
    throw error;
  }
}

// Save data to MongoDB (no-op since we save immediately on changes)
export async function saveData() {
  // MongoDB saves immediately, so this is a no-op
  console.log('Data saved to MongoDB');
}

// Tournament document functions
export async function getTournament(id: string): Promise<Tournament | null> {
  try {
    if (!db) await initMongo();
    const doc = await tournamentsCol().findOne({ _id: id });
    if (!doc) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = doc;
    return { id: _id, ...rest } as Tournament;
  } catch (error) {
    console.error('Error getting tournament:', error);
    return null;
  }
}

export async function setTournament(tournament: Tournament): Promise<void> {
  try {
    if (!db) await initMongo();
    const { id, ...doc } = tournament;
    await tournamentsCol().replaceOne({ _id: id }, doc, { upsert: true });
  } catch (error) {
    console.error('Error setting tournament:', error);
    throw error;
  }
}

// Update player → tournament ID references.
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
    if (!db) await initMongo();
    const tournament = await getTournament(id);
    if (tournament) {
      // Remove all match index entries for this tournament
      const matchIds = (tournament.matches ?? []).map(m => m.id);
      if (matchIds.length > 0) {
        await matchIndexCol().deleteMany({ _id: { $in: matchIds } });
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
    await tournamentsCol().deleteOne({ _id: id });
  } catch (error) {
    console.error('Error deleting tournament:', error);
    throw error;
  }
}

export async function getActiveTournamentIds(): Promise<string[]> {
  try {
    if (!db) await initMongo();
    const docs = await tournamentsCol()
      .find({ status: { $ne: 'completed' } }, { projection: { _id: 1 } })
      .sort({ startDate: 1 })
      .toArray();
    return docs.map(d => d._id);
  } catch (error) {
    console.error('Error getting active tournament IDs:', error);
    return [];
  }
}

export async function getCompletedTournamentIds(): Promise<string[]> {
  try {
    if (!db) await initMongo();
    const docs = await tournamentsCol()
      .find({ status: 'completed' }, { projection: { _id: 1 } })
      .sort({ startDate: 1 })
      .toArray();
    return docs.map(d => d._id);
  } catch (error) {
    console.error('Error getting completed tournament IDs:', error);
    return [];
  }
}

// Getters
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

export async function getTournaments(): Promise<Tournament[]> {
  try {
    if (!db) await initMongo();
    const docs = await tournamentsCol().find({}).sort({ startDate: 1 }).toArray();
    return docs.map(({ _id, ...rest }) => ({ id: _id, ...rest } as Tournament));
  } catch (error) {
    console.error('Error getting tournaments:', error);
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
    if (!db) await initMongo();
    const doc = await matchIndexCol().findOne({ _id: matchId });
    return doc?.tournamentId ?? null;
  } catch (error) {
    console.error('Error getting tournament ID for match:', error);
    return null;
  }
}

export async function registerMatchIndex(matchId: string, tournamentId: string): Promise<void> {
  try {
    if (!db) await initMongo();
    await matchIndexCol().replaceOne(
      { _id: matchId },
      { tournamentId },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error registering match index:', error);
    throw error;
  }
}

export async function unregisterMatchIndex(matchId: string): Promise<void> {
  try {
    if (!db) await initMongo();
    await matchIndexCol().deleteOne({ _id: matchId });
  } catch (error) {
    console.error('Error unregistering match index:', error);
    throw error;
  }
}

// Bulk-register multiple matches in the index (used when creating many matches at once)
export async function registerMatchesIndex(matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  try {
    if (!db) await initMongo();
    const ops = matches.map(m => ({
      replaceOne: {
        filter: { _id: m.id },
        replacement: { tournamentId: m.tournamentId },
        upsert: true,
      },
    }));
    await matchIndexCol().bulkWrite(ops);
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