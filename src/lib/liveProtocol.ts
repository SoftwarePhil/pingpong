import type { Tournament } from '../types/pingpong';

/** Messages sent from the WebSocket server to connected clients. */
export type LiveServerMessage =
  | { type: 'subscribed'; clubId: string; isAdmin: boolean }
  | { type: 'tournament'; version: number; tournament: Tournament }
  | {
      type: 'tournament_removed';
      tournamentId: string;
      reason: 'ended' | 'deleted';
      version?: number;
      tournament?: Tournament;
    };

/** Messages sent from connected clients to the WebSocket server. */
export type LiveClientMessage = {
  type: 'subscribe';
  clubId: string;
};

/** Parses an incoming client message. Returns null for invalid or unsupported payloads. */
export function parseLiveClientMessage(raw: string): LiveClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { type, clubId } = parsed as Record<string, unknown>;
    if (type === 'subscribe' && typeof clubId === 'string' && clubId.trim().length > 0 && clubId.length <= 128) {
      return { type: 'subscribe', clubId: clubId.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

/** Parses an incoming server message on the client. Returns null for unknown or malformed payloads. */
export function parseLiveServerMessage(raw: string): LiveServerMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const msg = parsed as Record<string, unknown>;
    if (msg.type === 'subscribed' && typeof msg.clubId === 'string' && typeof msg.isAdmin === 'boolean') {
      return { type: 'subscribed', clubId: msg.clubId, isAdmin: msg.isAdmin };
    }
    if (
      msg.type === 'tournament' &&
      typeof msg.version === 'number' &&
      msg.tournament &&
      typeof msg.tournament === 'object'
    ) {
      return {
        type: 'tournament',
        version: msg.version,
        tournament: msg.tournament as Tournament,
      };
    }
    if (
      msg.type === 'tournament_removed' &&
      typeof msg.tournamentId === 'string' &&
      (msg.reason === 'ended' || msg.reason === 'deleted')
    ) {
      return {
        type: 'tournament_removed',
        tournamentId: msg.tournamentId,
        reason: msg.reason,
        ...(typeof msg.version === 'number' && { version: msg.version }),
        ...(msg.tournament && typeof msg.tournament === 'object'
          ? { tournament: msg.tournament as Tournament }
          : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}
