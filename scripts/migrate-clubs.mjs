#!/usr/bin/env node
/**
 * Clubs migration: puts every existing record into the "dallas" club.
 *
 *   node --env-file=.env.local scripts/migrate-clubs.mjs --env development            # dry run
 *   node --env-file=.env.local scripts/migrate-clubs.mjs --env development --apply    # write
 *
 * --env is required and picks the MongoDB database (pingpong_<env>) and Redis
 * key prefix (<env>:pingpong:). Development and production share a cluster,
 * so the script never guesses. Without --apply nothing is written.
 *
 * Steps, each safe to repeat:
 *   1. Create the club (slug "dallas") if it doesn't exist.
 *   2. Delete games in the history whose match no longer exists (bug B9).
 *   3. Set clubId on players, tournaments and games that don't have one,
 *      including a live tournament in Redis.
 *   4. Create indexes: unique club slug, and clubId on the other collections.
 *
 * Take an export (Settings → Export all data) before running with --apply.
 */
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createClient, WatchError } from 'redis';

const CLUB = { slug: 'dallas', name: 'dallas' };

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const env = envIndex >= 0 ? args[envIndex + 1] : undefined;
const apply = args.includes('--apply');
if (!env || env.startsWith('--')) {
  console.error('Usage: scripts/migrate-clubs.mjs --env <development|production|…> [--apply]');
  process.exit(2);
}
if (!process.env.MONGODB_URL || !process.env.REDIS_URL) {
  console.error('MONGODB_URL and REDIS_URL must be set (for example with --env-file=.env.local).');
  process.exit(2);
}

const dbName = `pingpong_${env}`;
const prefix = `${env}:pingpong:`;
const activeKey = `${prefix}active_tournaments`;
const tournamentKey = id => `${prefix}tournament:${id}`;
const log = (...parts) => console.log(...parts);
const plan = apply ? '' : ' (dry run: would)';

const mongoUrl = process.env.MONGODB_URL;
const mongo = new MongoClient(mongoUrl, mongoUrl.includes('mongodb+srv') || mongoUrl.includes('mongodb.net') ? { tls: true } : {});
const redis = createClient({ url: process.env.REDIS_URL });

try {
  await mongo.connect();
  await redis.connect();
  const db = mongo.db(dbName);
  const clubs = db.collection('clubs');
  const players = db.collection('players');
  const tournaments = db.collection('tournaments');
  const games = db.collection('games');

  log(`Target: MongoDB "${dbName}", Redis prefix "${prefix}"${apply ? '' : ' — DRY RUN, nothing will be written'}`);

  // 1. The club
  let club = await clubs.findOne({ slug: CLUB.slug });
  if (club) {
    log(`1. Club "${CLUB.slug}" already exists (${club._id}).`);
  } else if (apply) {
    club = { _id: randomUUID(), name: CLUB.name, slug: CLUB.slug, createdAt: new Date().toISOString() };
    await clubs.insertOne(club);
    log(`1. Created club "${CLUB.slug}" (${club._id}).`);
  } else {
    club = { _id: '<new club id>' };
    log(`1.${plan} create club "${CLUB.slug}".`);
  }

  // Every tournament: completed ones in MongoDB, live ones in Redis.
  const liveIds = await redis.zRange(activeKey, 0, -1);
  const liveDocs = (await Promise.all(liveIds.map(id => redis.get(tournamentKey(id))))).filter(Boolean).map(doc => JSON.parse(doc));
  const storedTournaments = await tournaments.find({}, { projection: { matches: 1 } }).toArray();
  const allTournaments = [...storedTournaments, ...liveDocs];

  // 2. Leftover games from deleted tournaments and matches
  const embeddedGameIds = new Set(allTournaments.flatMap(t => (t.matches ?? []).flatMap(m => m.games.map(g => g._id ?? g.id))));
  const historyIds = (await games.find({}, { projection: { _id: 1 } }).toArray()).map(g => g._id);
  const orphanIds = historyIds.filter(id => !embeddedGameIds.has(id));
  if (orphanIds.length === 0) {
    log('2. No leftover games in the history.');
  } else if (allTournaments.length === 0 || orphanIds.length > historyIds.length / 2) {
    // Guard: if tournaments failed to load, every game would look orphaned.
    throw new Error(`Refusing to delete ${orphanIds.length} of ${historyIds.length} games: that is more than half the history. Check the tournaments loaded correctly.`);
  } else if (apply) {
    const { deletedCount } = await games.deleteMany({ _id: { $in: orphanIds } });
    log(`2. Deleted ${deletedCount} leftover games whose match no longer exists.`);
  } else {
    log(`2.${plan} delete ${orphanIds.length} leftover games whose match no longer exists.`);
  }

  // 3. clubId on stored records
  const missing = { clubId: { $exists: false } };
  for (const [label, collection] of [['players', players], ['completed tournaments', tournaments], ['games', games]]) {
    const count = await collection.countDocuments(missing);
    if (count === 0) {
      log(`3. All ${label} already have a clubId.`);
    } else if (apply) {
      const { modifiedCount } = await collection.updateMany(missing, { $set: { clubId: club._id } });
      log(`3. Set clubId on ${modifiedCount} ${label}.`);
    } else {
      log(`3.${plan} set clubId on ${count} ${label}.`);
    }
  }

  // 3b. Live tournaments in Redis, under WATCH so a game recorded meanwhile isn't lost.
  for (const id of liveIds) {
    const key = tournamentKey(id);
    const isolated = redis.duplicate();
    await isolated.connect();
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await isolated.watch(key);
        const doc = await isolated.get(key);
        if (!doc) { await isolated.unwatch(); log(`3. Live tournament ${id} has no document; skipped.`); break; }
        const tournament = JSON.parse(doc);
        if (tournament.clubId) { await isolated.unwatch(); log(`3. Live tournament "${tournament.name}" already has a clubId.`); break; }
        if (!apply) { await isolated.unwatch(); log(`3.${plan} set clubId on live tournament "${tournament.name}".`); break; }
        try {
          await isolated.multi().set(key, JSON.stringify({ ...tournament, clubId: club._id })).exec();
          log(`3. Set clubId on live tournament "${tournament.name}".`);
          break;
        } catch (error) {
          if (!(error instanceof WatchError) || attempt === 3) throw error;
        }
      }
    } finally {
      await isolated.quit().catch(() => {});
    }
  }
  if (liveIds.length === 0) log('3. No live tournament in Redis.');

  // 4. Indexes
  if (apply) {
    await clubs.createIndex({ slug: 1 }, { unique: true });
    await players.createIndex({ clubId: 1 });
    await tournaments.createIndex({ clubId: 1 });
    await games.createIndex({ clubId: 1, date: 1 });
    log('4. Indexes in place: clubs.slug (unique), players.clubId, tournaments.clubId, games.clubId+date.');
  } else {
    log(`4.${plan} create indexes: clubs.slug (unique), players.clubId, tournaments.clubId, games.clubId+date.`);
  }

  // Check
  if (apply) {
    const left = await Promise.all([players, tournaments, games].map(c => c.countDocuments(missing)));
    const total = left.reduce((a, b) => a + b, 0);
    log(total === 0 ? 'Done. Every record has a clubId.' : `Done, but ${total} records still lack a clubId (players, tournaments, games: ${left.join(', ')}).`);
    if (total !== 0) process.exitCode = 1;
  } else {
    log('Dry run complete. Re-run with --apply to make these changes.');
  }
} catch (error) {
  console.error('Migration failed:', error.message ?? error);
  process.exitCode = 1;
} finally {
  await mongo.close().catch(() => {});
  await redis.quit().catch(() => {});
}
