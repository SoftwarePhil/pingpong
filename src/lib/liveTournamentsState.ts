import type { Match, Tournament } from '../types/pingpong';

export interface TournamentUpdateResult {
  tournaments: Tournament[];
  applied: boolean;
  previous?: Tournament;
}

/**
 * Applies an incoming tournament snapshot, ignoring stale or duplicate versions.
 * Tournaments without a version count as version 0.
 */
export function applyTournamentUpdate(
  current: Tournament[],
  incoming: Tournament,
  incomingVersion?: number,
): TournamentUpdateResult {
  const nextVersion = incomingVersion ?? incoming.version ?? 0;
  const normalized: Tournament =
    nextVersion > 0 && incoming.version !== nextVersion
      ? { ...incoming, version: nextVersion }
      : incoming;

  const index = current.findIndex(t => t.id === normalized.id);
  if (index === -1) {
    return {
      tournaments: [...current, normalized],
      applied: true,
    };
  }

  const existing = current[index];
  const currentVersion = existing.version ?? 0;
  if (nextVersion > 0 && currentVersion > 0 && nextVersion <= currentVersion) {
    return {
      tournaments: current,
      applied: false,
      previous: existing,
    };
  }

  const next = [...current];
  next[index] = normalized;
  return {
    tournaments: next,
    applied: true,
    previous: existing,
  };
}

/**
 * Applies a tournament removal broadcast. When a tournament ended and the
 * completed snapshot is included, it updates in place so completed-tournament
 * views (such as the club home page) see the new champion while active views
 * stop showing it. Deletions remove the entry altogether.
 */
export function applyTournamentRemoval(
  current: Tournament[],
  tournamentId: string,
  reason: 'ended' | 'deleted',
  tournament?: Tournament,
  version?: number,
): TournamentUpdateResult {
  if (reason === 'ended' && tournament) {
    return applyTournamentUpdate(current, tournament, version);
  }

  const existing = current.find(t => t.id === tournamentId);
  if (!existing) {
    return { tournaments: current, applied: false };
  }
  return {
    tournaments: current.filter(t => t.id !== tournamentId),
    applied: true,
    previous: existing,
  };
}

/** Deterministic summary of the fields an admin can edit on a match. */
export function matchFingerprint(match: Match): string {
  const games = match.games.map(g => `${g.id}:${g.score1}-${g.score2}`).join(',');
  const s1 = match.side1PlayerIds?.join('+') ?? '';
  const s2 = match.side2PlayerIds?.join('+') ?? '';
  return [
    match.player1Id,
    match.player2Id,
    s1,
    s2,
    match.bestOf,
    match.winnerId ?? '',
    match.winnerSide ?? '',
    games,
  ].join('|');
}

/** Match ids whose editable state changed or that were removed between two snapshots. */
export function diffChangedMatchIds(previous: Tournament | undefined, next: Tournament): string[] {
  if (!previous) return [];
  const nextById = new Map((next.matches ?? []).map(m => [m.id, m]));
  const changed: string[] = [];
  for (const prevMatch of previous.matches ?? []) {
    const nextMatch = nextById.get(prevMatch.id);
    if (!nextMatch || matchFingerprint(prevMatch) !== matchFingerprint(nextMatch)) {
      changed.push(prevMatch.id);
    }
  }
  return changed;
}

/** True when roster, pairing strategy, or stage changed between two tournament snapshots. */
export function didTournamentSettingsChange(previous: Tournament | undefined, next: Tournament): boolean {
  if (!previous) return false;
  const sameList = (a?: string[], b?: string[]) => {
    const left = a ?? [];
    const right = b ?? [];
    return left.length === right.length && left.every((value, i) => value === right[i]);
  };
  return (
    previous.status !== next.status ||
    previous.bracketStartedAt !== next.bracketStartedAt ||
    previous.rrPairingStrategy !== next.rrPairingStrategy ||
    !sameList(previous.players, next.players) ||
    !sameList(previous.activePlayers, next.activePlayers)
  );
}

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Exponential backoff with up to 25% jitter, capped at 30 seconds. */
export function nextReconnectDelayMs(attempt: number, randomValue = Math.random()): number {
  const clampedAttempt = Math.max(0, Math.min(attempt, 5));
  const base = Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * 2 ** clampedAttempt);
  const jitter = Math.max(0, Math.min(1, randomValue)) * 0.25;
  return Math.round(base * (1 + jitter));
}
