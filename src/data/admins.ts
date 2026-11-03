import { createHash, randomBytes } from 'crypto';
import { Collection } from 'mongodb';
import { Admin, AdminRole } from '../types/pingpong';
import { newId } from '../lib/random';
import { getMongoDb } from './data';

// ─────────────────────────────────────────────────────────────────────────────
// Admin accounts and single-use sign-in links — MongoDB
// ─────────────────────────────────────────────────────────────────────────────

type AdminDoc = Omit<Admin, 'id'> & { _id: string };
/** _id is the SHA-256 of the token, so a database leak doesn't leak working links. */
type LoginLinkDoc = { _id: string; adminId: string; createdAt: Date; expiresAt: Date };

export const LOGIN_LINK_MINUTES = 15;

export class AdminExistsError extends Error {
  constructor(email: string) {
    super(`An admin with the email ${email} already exists`);
    this.name = 'AdminExistsError';
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super('A club needs at least one owner');
    this.name = 'LastOwnerError';
  }
}

let indexesPromise: Promise<void> | null = null;

async function collections(): Promise<{ admins: Collection<AdminDoc>; links: Collection<LoginLinkDoc> }> {
  const db = await getMongoDb();
  const admins = db.collection<AdminDoc>('admins');
  const links = db.collection<LoginLinkDoc>('login_links');
  indexesPromise ??= Promise.all([
    admins.createIndex({ email: 1 }, { unique: true }),
    admins.createIndex({ clubId: 1 }),
    // MongoDB removes expired links on its own; lookups still check expiresAt.
    links.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).then(() => undefined).catch(error => {
    indexesPromise = null;
    throw error;
  });
  await indexesPromise;
  return { admins, links };
}

function toAdmin({ _id, ...admin }: AdminDoc): Admin {
  return { id: _id, ...admin };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getAdminById(id: string): Promise<Admin | null> {
  const { admins } = await collections();
  const doc = await admins.findOne({ _id: id });
  return doc ? toAdmin(doc) : null;
}

export async function getAdminByEmail(email: string): Promise<Admin | null> {
  const { admins } = await collections();
  const doc = await admins.findOne({ email: normalizeEmail(email) });
  return doc ? toAdmin(doc) : null;
}

export async function listAdmins(clubId: string): Promise<Admin[]> {
  const { admins } = await collections();
  const docs = await admins.find({ clubId }).sort({ createdAt: 1 }).toArray();
  return docs.map(toAdmin);
}

export async function addAdmin(input: { clubId: string; email: string; name: string; role: AdminRole }): Promise<Admin> {
  const { admins } = await collections();
  const doc: AdminDoc = {
    _id: newId(),
    clubId: input.clubId,
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  try {
    await admins.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new AdminExistsError(doc.email); // duplicate key
    throw error;
  }
  return toAdmin(doc);
}

/** Removes an admin from a club, refusing to remove the club's last owner. Returns false if not found. */
export async function removeAdmin(clubId: string, id: string): Promise<boolean> {
  const { admins } = await collections();
  const admin = await admins.findOne({ _id: id, clubId });
  if (!admin) return false;
  if (admin.role === 'owner' && await admins.countDocuments({ clubId, role: 'owner' }) <= 1) {
    throw new LastOwnerError();
  }
  const { deletedCount } = await admins.deleteOne({ _id: id, clubId });
  return deletedCount === 1;
}

export async function recordSignIn(id: string): Promise<void> {
  const { admins } = await collections();
  await admins.updateOne({ _id: id }, { $set: { lastSignInAt: new Date().toISOString() } });
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a single-use sign-in token for the admin. Only its hash is stored. */
export async function createLoginLink(adminId: string): Promise<string> {
  const { links } = await collections();
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await links.insertOne({
    _id: hashToken(token),
    adminId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + LOGIN_LINK_MINUTES * 60_000),
  });
  return token;
}

/** Uses up a sign-in token. Returns the admin id, or null if the token is unknown, used or expired. */
export async function consumeLoginLink(token: string): Promise<string | null> {
  const { links } = await collections();
  // Deleting as we read makes the token single-use even if two requests race.
  const doc = await links.findOneAndDelete({ _id: hashToken(token), expiresAt: { $gt: new Date() } });
  return doc?.adminId ?? null;
}
