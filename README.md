# 🏓 Ping Pong Tracker

Match, player, tournament, and stats tracker for office ping pong. Built with Next.js and Redis.

## Features

- **Players** — add players, view per-player stats and match history
- **Tournaments** — create round-robin + bracket tournaments, advance rounds, track results
- **Stats** — leaderboard with win rate, games played, points per game
- **Live bracket** — bracket view with fireworks celebration on completion

## Getting Started

### Prerequisites

Redis is required for data storage. Start it with Docker Compose:

```bash
npm run redis:start  # Start Redis (via docker compose)
npm run redis:stop   # Stop Redis
```

Or bring up the full stack directly:

```bash
docker compose up -d redis
docker compose down
```

### Redis Configuration

Copy `.env.example` to `.env.local` and set your Redis URL:

```bash
# Local (no password)
REDIS_URL=redis://localhost:6379

# Local with password
REDIS_URL=redis://:mypassword@localhost:6379

# Remote
REDIS_URL=redis://username:password@redis.example.com:6379/0
```

The Docker Compose setup uses `REDIS_PASSWORD` (defaults to `mypassword`). Make sure `REDIS_URL` in `.env.local` matches.

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data Model

Games are stored **inside matches**, which are stored **inside tournament documents** — the tournament is the single source of truth. A `pingpong:match_index` Redis hash provides O(1) match → tournament lookups.

See [docs/redis-schema-analysis.md](docs/redis-schema-analysis.md) for full schema details.

## Docs

| File | Description |
|------|-------------|
| [docs/redis-schema-analysis.md](docs/redis-schema-analysis.md) | Redis schema design and rationale |
| [docs/hybrid-schema-clarification.md](docs/hybrid-schema-clarification.md) | Embedded vs. separate match storage trade-offs |
| [docs/bracket-requirements.md](docs/bracket-requirements.md) | Bracket tournament rules and format |
| [docs/player-stats-clarification.md](docs/player-stats-clarification.md) | How player stats are calculated |
| [docs/player-page-stats-solution.md](docs/player-page-stats-solution.md) | Player page stats implementation notes |
