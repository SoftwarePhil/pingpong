import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { LiveHub, getLiveHub } from '../lib/liveHub';
import { attachLiveWebSockets, handleHealthz } from '../lib/wsServer';
import { AUTH_COOKIE, createSessionToken } from '../lib/sessionToken';
import { Tournament } from '../types/pingpong';

function sampleTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't-1',
    clubId: 'club-dallas',
    name: 'Friday Open',
    startDate: '2026-11-27T12:00:00.000Z',
    status: 'roundRobin',
    roundRobinRounds: 2,
    rrBestOf: 1,
    bracketRounds: [{ matchCount: 1, bestOf: 3 }],
    players: ['p1', 'p2'],
    matches: [],
    version: 3,
    ...overrides,
  };
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WS message')), 2_000);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString('utf8')));
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

describe('LiveHub and WebSocket server', () => {
  let server: http.Server;
  let port: number;
  let hub: LiveHub;
  let closeWs: () => Promise<void>;
  const openSockets: WebSocket[] = [];

  beforeEach(async () => {
    hub = new LiveHub();
    server = http.createServer((req, res) => {
      if (handleHealthz(req, res)) return;
      res.writeHead(404);
      res.end('not found');
    });
    const attached = attachLiveWebSockets(server, {
      hub,
      heartbeatIntervalMs: 60_000,
    });
    closeWs = attached.close;

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const socket of openSockets.splice(0)) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    }
    await closeWs();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function connect(path = '/ws', headers?: Record<string, string>): WebSocket {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    openSockets.push(ws);
    return ws;
  }

  it('answers GET /healthz with 200 OK JSON', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/healthz`, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      }).on('error', reject);
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('recognizes signed-in admin cookies and read-only visitors on /ws', async () => {
    const token = createSessionToken('admin-1');
    const adminWs = connect('/ws?clubId=club-dallas', { Cookie: `${AUTH_COOKIE}=${token}` });
    const visitorWs = connect('/ws?clubId=club-dallas');

    const [adminMsg, visitorMsg] = await Promise.all([nextMessage(adminWs), nextMessage(visitorWs)]);
    expect(adminMsg).toEqual({ type: 'subscribed', clubId: 'club-dallas', isAdmin: true });
    expect(visitorMsg).toEqual({ type: 'subscribed', clubId: 'club-dallas', isAdmin: false });
  });

  it('broadcasts tournament updates and removals only to subscribers of that club', async () => {
    const dallasWs = connect('/ws');
    const austinWs = connect('/ws');
    await Promise.all([waitForOpen(dallasWs), waitForOpen(austinWs)]);

    const dallasSub = nextMessage(dallasWs);
    const austinSub = nextMessage(austinWs);
    dallasWs.send(JSON.stringify({ type: 'subscribe', clubId: 'club-dallas' }));
    austinWs.send(JSON.stringify({ type: 'subscribe', clubId: 'club-austin' }));
    await Promise.all([dallasSub, austinSub]);

    const austinMessages: unknown[] = [];
    austinWs.on('message', (data) => austinMessages.push(JSON.parse(data.toString('utf8'))));

    const tournament = sampleTournament({ clubId: 'club-dallas', version: 4 });
    const updatePromise = nextMessage(dallasWs);
    expect(hub.broadcastTournament(tournament)).toBe(1);
    expect(await updatePromise).toEqual({
      type: 'tournament',
      version: 4,
      tournament,
    });

    const removalPromise = nextMessage(dallasWs);
    expect(hub.broadcastTournamentRemoved('club-dallas', 't-1', 'deleted')).toBe(1);
    expect(await removalPromise).toEqual({
      type: 'tournament_removed',
      tournamentId: 't-1',
      reason: 'deleted',
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(austinMessages).toEqual([]);
  });

  it('shares the global singleton hub across calls to getLiveHub()', () => {
    expect(getLiveHub()).toBe(getLiveHub());
  });

  it('drops connections that stop responding to heartbeat pings', async () => {
    // Dedicated server with a short heartbeat interval.
    const fastHub = new LiveHub();
    const fastServer = http.createServer();
    const fastWs = attachLiveWebSockets(fastServer, {
      hub: fastHub,
      heartbeatIntervalMs: 40,
    });
    await new Promise<void>((resolve) => fastServer.listen(0, '127.0.0.1', () => resolve()));
    const fastPort = (fastServer.address() as AddressInfo).port;

    try {
      const client = new WebSocket(`ws://127.0.0.1:${fastPort}/ws?clubId=club-dallas`, {
        autoPong: false,
      });
      const subscribed = nextMessage(client);
      await waitForOpen(client);
      await subscribed;
      expect(fastHub.subscriberCount('club-dallas')).toBe(1);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Expected dead socket to be terminated')), 1_000);
        client.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      expect(fastHub.subscriberCount('club-dallas')).toBe(0);
    } finally {
      await fastWs.close();
      await new Promise<void>((resolve) => fastServer.close(() => resolve()));
    }
  });
});
