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

describe('Data layer live broadcasts', () => {
  it('broadcasts on createTournament, mutateTournament (update & completion), and deleteTournament', async () => {
    jest.resetModules();

    let storedDoc: string | null = null;
    const mockTx = {
      set: jest.fn((_k: string, val: string) => { storedDoc = val; return mockTx; }),
      del: jest.fn(() => { storedDoc = null; return mockTx; }),
      zAdd: jest.fn(() => mockTx),
      zRem: jest.fn(() => mockTx),
      hSet: jest.fn(() => mockTx),
      hDel: jest.fn(() => mockTx),
      exec: jest.fn().mockResolvedValue(['OK']),
    };
    const mockWatchClient = {
      isOpen: true,
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      watch: jest.fn().mockResolvedValue('OK'),
      unwatch: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(async () => storedDoc),
      multi: jest.fn(() => mockTx),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    const mockRedis = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(async () => storedDoc),
      set: jest.fn(async (_k: string, val: string) => { storedDoc = val; return 'OK'; }),
      del: jest.fn(async () => { storedDoc = null; return 1; }),
      zRange: jest.fn().mockResolvedValue([]),
      zAdd: jest.fn().mockResolvedValue(1),
      zRem: jest.fn().mockResolvedValue(1),
      hGet: jest.fn().mockResolvedValue(null),
      hSet: jest.fn().mockResolvedValue(1),
      hDel: jest.fn().mockResolvedValue(1),
      multi: jest.fn(() => mockTx),
      duplicate: jest.fn(() => mockWatchClient),
    };
    const mockCollection = {
      find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue([]) }),
      findOne: jest.fn().mockResolvedValue(null),
      replaceOne: jest.fn().mockResolvedValue({ matchedCount: 1, upsertedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      bulkWrite: jest.fn().mockResolvedValue({}),
    };
    const mockMongo = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      db: jest.fn().mockReturnValue({ collection: jest.fn().mockReturnValue(mockCollection) }),
    };

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => mockRedis),
      WatchError: class WatchError extends Error {},
    }));
    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn(() => mockMongo),
    }));

    const { getLiveHub: getHub } = await import('../lib/liveHub');
    const hub = getHub();
    hub.clear();

    const received: unknown[] = [];
    const fakeSocket = {
      readyState: 1,
      send: (data: string) => received.push(JSON.parse(data)),
    };
    hub.register(fakeSocket, 'admin-1');
    hub.subscribe(fakeSocket, 'club-dallas');
    received.length = 0; // ignore initial subscribed ack

    const { createTournament, mutateTournament, deleteTournament } = await import('../data/data');

    const created = await createTournament(sampleTournament({ id: 't-live', version: 1 }));
    expect(received[0]).toEqual({ type: 'tournament', version: 1, tournament: created });

    const { tournament: updated } = await mutateTournament('t-live', (t) => {
      t.name = 'Updated Open';
    });
    expect(received[1]).toEqual({ type: 'tournament', version: 2, tournament: updated });

    const { tournament: ended } = await mutateTournament('t-live', (t) => {
      t.status = 'completed';
    });
    expect(received[2]).toEqual({
      type: 'tournament_removed',
      tournamentId: 't-live',
      reason: 'ended',
      version: 3,
      tournament: ended,
    });

    // Simulate deleting an active tournament
    storedDoc = JSON.stringify(sampleTournament({ id: 't-del', version: 1 }));
    await deleteTournament('t-del');
    expect(received[3]).toEqual({
      type: 'tournament_removed',
      tournamentId: 't-del',
      reason: 'deleted',
    });

    hub.clear();
  });
});
