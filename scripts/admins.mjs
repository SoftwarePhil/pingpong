#!/usr/bin/env node
/**
 * Manage club admins from the command line. Use it to add the first owner,
 * and as a fallback sign-in when email isn't working.
 *
 *   node --env-file=.env.local scripts/admins.mjs list --env development
 *   node --env-file=.env.local scripts/admins.mjs add  --env development --email you@example.com --name "You" [--role owner|admin] [--club dallas]
 *   node --env-file=.env.local scripts/admins.mjs link --env development --email you@example.com --url http://localhost:3000
 *
 * --env is required and picks the MongoDB database (pingpong_<env>);
 * development and production share a cluster, so the script never guesses.
 * `link` prints a single-use sign-in link (15 minutes) instead of emailing it.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

const [command, ...rest] = process.argv.slice(2);
const option = name => {
  const index = rest.indexOf(`--${name}`);
  const value = index >= 0 ? rest[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
};
const env = option('env');
const usage = 'Usage: scripts/admins.mjs <list|add|link> --env <env> [--email <email>] [--name <name>] [--role owner|admin] [--club <slug>] [--url <app url>]';

if (!['list', 'add', 'link'].includes(command) || !env) {
  console.error(usage);
  process.exit(2);
}
if (!process.env.MONGODB_URL) {
  console.error('MONGODB_URL must be set (for example with --env-file=.env.local).');
  process.exit(2);
}

const mongoUrl = process.env.MONGODB_URL;
const mongo = new MongoClient(mongoUrl, mongoUrl.includes('mongodb+srv') || mongoUrl.includes('mongodb.net') ? { tls: true } : {});

try {
  await mongo.connect();
  const db = mongo.db(`pingpong_${env}`);
  const admins = db.collection('admins');
  const clubs = db.collection('clubs');
  await admins.createIndex({ email: 1 }, { unique: true });
  await admins.createIndex({ clubId: 1 });

  const clubSlug = option('club') ?? 'dallas';
  const club = await clubs.findOne({ slug: clubSlug });
  const email = option('email')?.trim().toLowerCase();

  if (command === 'list') {
    for (const admin of await admins.find({}).sort({ createdAt: 1 }).toArray()) {
      console.log(`${admin.role.padEnd(5)}  ${admin.email}  ${admin.name}  (club ${admin.clubId})`);
    }
  } else if (command === 'add') {
    const name = option('name');
    const role = option('role') ?? 'owner';
    if (!email || !name || !['owner', 'admin'].includes(role)) throw new Error(`add needs --email and --name, and --role owner or admin.\n${usage}`);
    if (!club) throw new Error(`No club with slug "${clubSlug}" in pingpong_${env}. Run the clubs migration first.`);
    if (await admins.findOne({ email })) throw new Error(`${email} is already an admin.`);
    const admin = { _id: randomUUID(), clubId: club._id, email, name, role, createdAt: new Date().toISOString() };
    await admins.insertOne(admin);
    console.log(`Added ${role} ${email} to club "${clubSlug}" in pingpong_${env}. They can now request a sign-in link from Settings.`);
  } else {
    const url = option('url')?.replace(/\/$/, '');
    if (!email || !url) throw new Error(`link needs --email and --url.\n${usage}`);
    const admin = await admins.findOne({ email });
    if (!admin) throw new Error(`${email} is not an admin in pingpong_${env}.`);
    const links = db.collection('login_links');
    await links.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    // Same scheme as src/data/admins.ts: only the token's SHA-256 is stored.
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await links.insertOne({
      _id: createHash('sha256').update(token).digest('hex'),
      adminId: admin._id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    console.log(`Single-use sign-in link for ${email} (15 minutes):\n${url}/sign-in#token=${token}`);
  }
} catch (error) {
  console.error(error.message ?? error);
  process.exitCode = 1;
} finally {
  await mongo.close().catch(() => {});
}
