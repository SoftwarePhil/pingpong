import { Player } from '../types/pingpong';

export type PlayerProfileFields = Pick<Player, 'name' | 'firstName' | 'lastName' | 'birthday' | 'profilePicture'>;
type OptionalPlayerStringField = 'firstName' | 'lastName' | 'profilePicture';
export const BIRTHDAY_CAKE = '🎂';

type ParseResult = { fields: Partial<PlayerProfileFields>; error?: string };

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

function parseBirthday(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateAtUtc(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

/** Returns true during the Monday-to-Sunday calendar week containing a birthday. */
export function isBirthdayWeek(player: Pick<Player, 'birthday'>, today = new Date()): boolean {
  if (!player.birthday) return false;
  const birthday = parseBirthday(player.birthday);
  if (!birthday) return false;

  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const weekStart = new Date(current);
  weekStart.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  for (const year of [current.getUTCFullYear() - 1, current.getUTCFullYear(), current.getUTCFullYear() + 1]) {
    // Celebrate Feb 29 birthdays during the week containing Feb 28 in non-leap years.
    const birthdayDate = dateAtUtc(year, birthday.getUTCMonth() + 1, birthday.getUTCDate())
      ?? (birthday.getUTCMonth() === 1 && birthday.getUTCDate() === 29 ? dateAtUtc(year, 2, 28) : null);
    if (birthdayDate && birthdayDate >= weekStart && birthdayDate <= weekEnd) return true;
  }
  return false;
}

/** Removes the API-only birthday marker from a display name before persistence. */
export function stripBirthdayCake(name: string): string {
  const cake = BIRTHDAY_CAKE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`\\s*${cake}(?:\\s*${cake})*\\s*$`, 'u'), '').trim();
}

/** Decorates a response copy without changing the stored player record. */
export function decoratePlayerName(player: Player, today = new Date()): Player {
  const name = stripBirthdayCake(player.name);
  return { ...player, name: isBirthdayWeek(player, today) ? `${name} ${BIRTHDAY_CAKE}` : name };
}

/** Returns a player's current age, calculated from their birthday. */
export function getPlayerAge(player: Pick<Player, 'birthday'>, today = todayUtc()): number | undefined {
  if (!player.birthday) return undefined;
  const birthday = parseBirthday(player.birthday);
  if (!birthday) return undefined;

  let age = today.getUTCFullYear() - birthday.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birthday.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birthday.getUTCDate())) age--;
  return age >= 0 ? age : undefined;
}

function parseOptionalString(
  body: Record<string, unknown>,
  key: OptionalPlayerStringField,
  label: string,
  maxLength: number,
  fields: Partial<PlayerProfileFields>
): string | undefined | null {
  if (!hasOwn(body, key)) return null;

  const value = body[key];
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    fields[key] = undefined;
    return null;
  }
  if (typeof value !== 'string') return `${label} must be a string`;

  const trimmed = value.trim();
  if (trimmed.length > maxLength) return `${label} must be ${maxLength} characters or fewer`;
  if (key === 'profilePicture') {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Profile picture must be a valid HTTP(S) URL';
      }
    } catch {
      return 'Profile picture must be a valid HTTP(S) URL';
    }
  }
  fields[key] = trimmed;
  return null;
}

/**
 * Parses profile fields shared by player creation and admin profile edits.
 * Optional values are represented as undefined so PATCH can remove them.
 */
export function parsePlayerProfileFields(body: unknown, requireName = false): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { fields: {}, error: 'Invalid player data' };
  }

  const input = body as Record<string, unknown>;
  const fields: Partial<PlayerProfileFields> = {};

  if (requireName && !hasOwn(input, 'name')) {
    return { fields: {}, error: 'Name is required' };
  }

  if (hasOwn(input, 'name')) {
    const name = input.name;
    if (typeof name !== 'string' || name.trim() === '') {
      return { fields: {}, error: 'Name is required' };
    }
    const trimmedName = stripBirthdayCake(name);
    if (!trimmedName) {
      return { fields: {}, error: 'Name is required' };
    }
    if (trimmedName.length > 200) {
      return { fields: {}, error: 'Name must be 200 characters or fewer' };
    }
    fields.name = trimmedName;
  }

  const stringFields: Array<[OptionalPlayerStringField, string, number]> = [
    ['firstName', 'First name', 100],
    ['lastName', 'Last name', 100],
    ['profilePicture', 'Profile picture', 2048],
  ];
  for (const [key, label, maxLength] of stringFields) {
    const error = parseOptionalString(input, key, label, maxLength, fields);
    if (error) return { fields: {}, error };
  }

  if (hasOwn(input, 'birthday')) {
    const value = input.birthday;
    if (value === null || value === undefined || value === '') {
      fields.birthday = undefined;
    } else {
      if (typeof value !== 'string' || value.trim() === '') {
        return { fields: {}, error: 'Birthday must be a valid date in YYYY-MM-DD format' };
      }
      const birthday = value.trim();
      const parsedBirthday = parseBirthday(birthday);
      if (!parsedBirthday) {
        return { fields: {}, error: 'Birthday must be a valid date in YYYY-MM-DD format' };
      }
      if (parsedBirthday.getTime() > todayUtc().getTime()) {
        return { fields: {}, error: 'Birthday cannot be in the future' };
      }
      fields.birthday = birthday;
    }
  }

  return { fields };
}
