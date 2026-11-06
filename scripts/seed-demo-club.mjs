#!/usr/bin/env node
/**
 * Creates the demo club anonymous visitors land on, with made-up players and
 * two finished tournaments.
 *
 *   node --env-file=.env.local scripts/seed-demo-club.mjs --env development            # dry run
 *   node --env-file=.env.local scripts/seed-demo-club.mjs --env development --apply    # write
 *
 * --env is required and picks the MongoDB database (pingpong_<env>);
 * development and production share a cluster, so the script never guesses.
 * If the club already exists nothing is changed, so its data can be edited
 * by hand without being overwritten.
 */
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

const CLUB = {
  slug: 'demo',
  name: 'Demo Club',
  about: 'A sample club with made-up players, showing how pingpong.beer tracks a weekly league.',
};
const PLAYER_NAMES = ['Avery Stone', 'Blair Quinn', 'Casey Moss', 'Drew Hale', 'Emery Lane', 'Finley Rhodes', 'Harper Vale', 'Jordan Pike'];
const TOURNAMENTS = [{ name: 'Fall Open', daysAgo: 21, rotate: 0 }, { name: 'Harvest Cup', daysAgo: 7, rotate: 3 }];
const SCORES = [[11, 7], [11, 9], [12, 10], [11, 4], [11, 8], [11, 6], [13, 11]];

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const env = envIndex >= 0 ? args[envIndex + 1] : undefined;
const apply = args.includes('--apply');
if (!env || env.startsWith('--')) {
  console.error('Usage: scripts/seed-demo-club.mjs --env <development|production|…> [--apply]');
  process.exit(2);
}
if (!process.env.MONGODB_URL) {
  console.error('MONGODB_URL must be set (for example with --env-file=.env.local).');
  process.exit(2);
}

/** A finished 8-player tournament: one round robin round, then a single-elimination bracket. */
function buildTournament({ name, daysAgo, rotate }, clubId, playerIds) {
  const id = randomUUID();
  const start = new Date(Date.now() - daysAgo * 24 * 60 * 60_000);
  const date = start.toISOString();
  const seeds = playerIds.map((_, index) => playerIds[(index + rotate) % playerIds.length]);
  const games = [];
  let scoreIndex = 0;

  // player1 always wins, so the better seed goes through.
  const play = (player1Id, player2Id, round, bracketRound) => {
    const matchId = randomUUID();
    const [score1, score2] = SCORES[scoreIndex++ % SCORES.length];
    const game = { id: randomUUID(), clubId, matchId, player1Id, player2Id, score1, score2, date };
    games.push(game);
    return { id: matchId, tournamentId: id, createdAt: date, player1Id, player2Id, round, bracketRound, bestOf: 1, games: [game], winnerId: player1Id };
  };

  const matches = [0, 1, 2, 3].map(i => play(seeds[i], seeds[7 - i], 'roundRobin', 1));
  let field = seeds;
  for (let round = 1; field.length > 1; round++) {
    const pairs = field.slice(0, field.length / 2).map((seed, i) => play(seed, field[field.length - 1 - i], 'bracket', round));
    matches.push(...pairs);
    field = pairs.map(match => match.winnerId);
  }

  return {
    tournament: {
      id, clubId, name, startDate: date, status: 'completed', bracketStartedAt: date,
      roundRobinRounds: 1, rrBestOf: 1, rrPairingStrategy: 'swiss',
      bracketRounds: [{ matchCount: 4, bestOf: 1 }, { matchCount: 2, bestOf: 1 }, { matchCount: 1, bestOf: 1 }],
      players: seeds, matches, bracketConfig: { thirdPlaceMatch: false },
    },
    games,
  };
}

const withMongoId = ({ id, ...doc }) => ({ _id: id, ...doc });
const mongoUrl = process.env.MONGODB_URL;
const mongo = new MongoClient(mongoUrl, mongoUrl.includes('mongodb+srv') || mongoUrl.includes('mongodb.net') ? { tls: true } : {});

try {
  await mongo.connect();
  const db = mongo.db(`pingpong_${env}`);
  console.log(`Target: MongoDB "pingpong_${env}"${apply ? '' : ' — DRY RUN, nothing will be written'}`);

  if (await db.collection('clubs').findOne({ slug: CLUB.slug })) {
    console.log(`Club "${CLUB.slug}" already exists; nothing to do.`);
    process.exit(0);
  }

  const clubId = randomUUID();
  const createdAt = new Date().toISOString();
  const players = PLAYER_NAMES.map(name => ({ id: randomUUID(), clubId, name, tournamentIds: [], createdAt }));
  const built = TOURNAMENTS.map(spec => buildTournament(spec, clubId, players.map(player => player.id)));
  players.forEach(player => { player.tournamentIds = built.map(({ tournament }) => tournament.id); });
  const games = built.flatMap(entry => entry.games);

  console.log(`${apply ? 'Creating' : 'Would create'} club "${CLUB.slug}" with ${players.length} players, ${built.length} tournaments and ${games.length} games.`);
  if (apply) {
    await db.collection('clubs').insertOne({ _id: clubId, ...CLUB, createdAt });
    await db.collection('players').insertMany(players.map(withMongoId));
    await db.collection('tournaments').insertMany(built.map(({ tournament }) => withMongoId(tournament)));
    await db.collection('games').insertMany(games.map(withMongoId));
    console.log('Done.');
  }
} catch (error) {
  console.error(error.message ?? error);
  process.exitCode = 1;
} finally {
  await mongo.close().catch(() => {});
}
