import type { Tournament } from '../types/pingpong';
import type { LiveServerMessage } from './liveProtocol';

/** Minimal WebSocket shape so this module has zero runtime dependency on `ws`. */
export interface LiveSocket {
  readonly readyState: number;
  send(data: string): void;
}

const WS_OPEN = 1;

export interface LiveClientRecord {
  socket: LiveSocket;
  clubId: string | null;
  adminId: string | null;
}

/**
 * In-process pub/sub hub for live tournament updates.
 *
 * Stored on `globalThis` via `Symbol.for` so the custom HTTP/WebSocket server
 * (`server.ts`) and Next.js API routes (which Next bundles separately) share
 * the exact same registry in one Node process.
 */
export class LiveHub {
  private readonly clients = new Map<LiveSocket, LiveClientRecord>();
  private readonly clubs = new Map<string, Set<LiveSocket>>();

  register(socket: LiveSocket, adminId: string | null = null): LiveClientRecord {
    const existing = this.clients.get(socket);
    if (existing) return existing;
    const record: LiveClientRecord = { socket, clubId: null, adminId };
    this.clients.set(socket, record);
    return record;
  }

  subscribe(socket: LiveSocket, clubId: string): LiveClientRecord {
    const record = this.register(socket);
    if (record.clubId && record.clubId !== clubId) {
      this.removeFromClub(record.clubId, socket);
    }
    record.clubId = clubId;
    let members = this.clubs.get(clubId);
    if (!members) {
      members = new Set();
      this.clubs.set(clubId, members);
    }
    members.add(socket);

    this.sendToSocket(socket, {
      type: 'subscribed',
      clubId,
      isAdmin: record.adminId !== null,
    });
    return record;
  }

  unregister(socket: LiveSocket): void {
    const record = this.clients.get(socket);
    if (!record) return;
    if (record.clubId) {
      this.removeFromClub(record.clubId, socket);
    }
    this.clients.delete(socket);
  }

  broadcastTournament(tournament: Tournament): number {
    return this.broadcastToClub(tournament.clubId, {
      type: 'tournament',
      version: tournament.version ?? 0,
      tournament,
    });
  }

  broadcastTournamentRemoved(
    clubId: string,
    tournamentId: string,
    reason: 'ended' | 'deleted',
    tournament?: Tournament,
  ): number {
    return this.broadcastToClub(clubId, {
      type: 'tournament_removed',
      tournamentId,
      reason,
      ...(tournament !== undefined && {
        version: tournament.version ?? 0,
        tournament,
      }),
    });
  }

  subscriberCount(clubId?: string): number {
    if (clubId === undefined) return this.clients.size;
    return this.clubs.get(clubId)?.size ?? 0;
  }

  clear(): void {
    this.clients.clear();
    this.clubs.clear();
  }

  private removeFromClub(clubId: string, socket: LiveSocket): void {
    const members = this.clubs.get(clubId);
    if (!members) return;
    members.delete(socket);
    if (members.size === 0) {
      this.clubs.delete(clubId);
    }
  }

  private broadcastToClub(clubId: string, message: LiveServerMessage): number {
    const members = this.clubs.get(clubId);
    if (!members || members.size === 0) return 0;
    const payload = JSON.stringify(message);
    let sent = 0;
    for (const socket of [...members]) {
      if (socket.readyState !== WS_OPEN) {
        this.unregister(socket);
        continue;
      }
      try {
        socket.send(payload);
        sent++;
      } catch {
        this.unregister(socket);
      }
    }
    return sent;
  }

  private sendToSocket(socket: LiveSocket, message: LiveServerMessage): void {
    if (socket.readyState !== WS_OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.unregister(socket);
    }
  }
}

const LIVE_HUB_SYMBOL = Symbol.for('pingpong.liveHub');

type GlobalWithLiveHub = typeof globalThis & {
  [LIVE_HUB_SYMBOL]?: LiveHub;
};

export function getLiveHub(): LiveHub {
  const g = globalThis as GlobalWithLiveHub;
  if (!g[LIVE_HUB_SYMBOL]) {
    g[LIVE_HUB_SYMBOL] = new LiveHub();
  }
  return g[LIVE_HUB_SYMBOL];
}
