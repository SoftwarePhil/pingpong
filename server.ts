import { createServer } from 'http';
import next from 'next';
import { attachLiveWebSockets, handleHealthz } from './src/lib/wsServer';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || (dev ? 'localhost' : '0.0.0.0');
const port = Number(process.env.PORT || 3000);

async function start() {
  const app = next({ dev, hostname, port });
  const handleRequest = app.getRequestHandler();

  await app.prepare();

  const handleUpgrade = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    if (handleHealthz(req, res)) return;
    handleRequest(req, res).catch((err) => {
      console.error('Error handling request:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal server error');
      }
    });
  });

  const liveWs = attachLiveWebSockets(server, {
    onOtherUpgrade: dev
      ? (req, socket, head) => {
          handleUpgrade(req, socket, head);
        }
      : undefined,
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down...`);
    void liveWs.close().finally(() => {
      server.close(() => process.exit(0));
    });
    // Force exit if connections refuse to drain within Fly's stop grace period.
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(port, hostname, () => {
    const dataEnv = process.env.PINGPONG_ENV?.trim() || process.env.NODE_ENV || 'development';
    console.log(`> Ping Pong server ready on http://${hostname}:${port} (env: ${dataEnv})`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
