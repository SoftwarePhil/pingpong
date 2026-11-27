import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { getLiveHub, LiveHub } from './liveHub';
import { parseLiveClientMessage } from './liveProtocol';
import { adminIdFromCookieHeader } from './sessionToken';

export const WS_PATH = '/ws';
export const HEALTHZ_PATH = '/healthz';
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

interface TrackedWebSocket extends WebSocket {
  isAlive?: boolean;
}

export interface AttachLiveWebSocketsOptions {
  hub?: LiveHub;
  heartbeatIntervalMs?: number;
  /** Optional fallback for non-/ws upgrades (e.g. Next.js dev HMR). */
  onOtherUpgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

export interface AttachedLiveWebSockets {
  wss: WebSocketServer;
  close: () => Promise<void>;
}

/** Handles GET/HEAD `/healthz`. Returns true if it wrote the response. */
export function handleHealthz(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = requestPathname(req.url);
  if (pathname !== HEALTHZ_PATH) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return true;
  }
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true }));
  return true;
}

function requestUrl(rawUrl: string | undefined): URL | null {
  try {
    return new URL(rawUrl ?? '/', 'http://localhost');
  } catch {
    return null;
  }
}

export function requestPathname(rawUrl: string | undefined): string {
  return requestUrl(rawUrl)?.pathname ?? '/';
}

/**
 * Attaches the `/ws` WebSocket server to an HTTP server, authenticates the
 * optional admin session cookie on upgrade, wires club subscriptions into the
 * live hub, and runs a 30 s ping/pong heartbeat to drop dead connections.
 */
export function attachLiveWebSockets(
  server: HttpServer,
  options: AttachLiveWebSocketsOptions = {},
): AttachedLiveWebSockets {
  const hub = options.hub ?? getLiveHub();
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  wss.on('connection', (rawWs: WebSocket, req: IncomingMessage) => {
    const ws = rawWs as TrackedWebSocket;
    ws.isAlive = true;

    const adminId = adminIdFromCookieHeader(req.headers.cookie);
    hub.register(ws, adminId);

    const url = requestUrl(req.url);
    const initialClubId = url?.searchParams.get('clubId')?.trim();
    if (initialClubId && initialClubId.length <= 128) {
      hub.subscribe(ws, initialClubId);
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      const message = parseLiveClientMessage(text);
      if (!message) return;
      if (message.type === 'subscribe') {
        hub.subscribe(ws, message.clubId);
      }
    });

    ws.on('close', () => {
      hub.unregister(ws);
    });

    ws.on('error', () => {
      hub.unregister(ws);
    });
  });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (requestPathname(req.url) === WS_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }
    if (options.onOtherUpgrade) {
      options.onOtherUpgrade(req, socket, head);
      return;
    }
    socket.destroy();
  };

  server.on('upgrade', onUpgrade);

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as TrackedWebSocket;
      if (ws.isAlive === false) {
        hub.unregister(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref?.();

  const close = () =>
    new Promise<void>((resolve) => {
      clearInterval(heartbeat);
      server.off('upgrade', onUpgrade);
      for (const client of wss.clients) {
        hub.unregister(client);
        try {
          client.close(1001, 'Server shutting down');
        } catch {
          client.terminate();
        }
      }
      wss.close(() => resolve());
    });

  return { wss, close };
}
