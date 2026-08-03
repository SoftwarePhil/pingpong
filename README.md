# 🏓 Ping Pong Tracker

Match, player, tournament, and stats tracker for office ping pong. Built with Next.js, Redis, and MongoDB.

## Features

- **Players** — add players, view per-player stats and match history
- **Tournaments** — create round-robin + bracket tournaments, advance rounds, track results
- **Stats** — leaderboard with win rate, games played, points per game
- **Live bracket** — bracket view with fireworks celebration on completion

## Getting Started

### Prerequisites

Both Redis and MongoDB are required. Start them with Docker Compose:

```bash
npm run db:start    # Start both Redis and MongoDB
npm run db:stop     # Stop both

# Or individually:
npm run redis:start
npm run mongodb:start
```

### Configuration

Copy `.env.example` to `.env.local` and set your connection URLs:

```bash
# Redis (tournament state)
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@localhost:6379

# MongoDB (players + game history)
MONGODB_URL=mongodb://YOUR_MONGO_USER:YOUR_MONGO_PASSWORD@localhost:27017

# Shared admin password
ADMIN_PASSWORD=choose-a-strong-password

# Secret used to sign admin sessions
AUTH_SECRET=choose-a-long-random-secret
```

The Docker Compose setup uses `REDIS_PASSWORD` (default `mypassword`) and `MONGO_USERNAME` / `MONGO_PASSWORD` (defaults `admin` / `mypassword`). Make sure the URLs in `.env.local` match.

### Authentication

The app currently uses a simple shared-password model:

- Visitors are `player` users by default and can view tournaments, results, brackets, history, and stats.
- Players cannot record or edit games, change rosters, configure brackets, create players, or manage tournaments.
- Admins select **Admin sign in** in the page header and enter the configured `ADMIN_PASSWORD` to unlock the existing management controls.
- Admin access is stored in a signed, HTTP-only session cookie. Use **Sign out** when finished.

Set `ADMIN_PASSWORD` in `.env.local` before starting the app. Set `AUTH_SECRET` to a long, random value in deployed environments; it is used to sign the admin session cookie. Changing either value invalidates existing admin sessions after the app restarts.

Never commit `.env.local` or share the admin password. The role/session boundary is centralized so the shared password can later be replaced with individual accounts or an external auth provider.

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data Architecture — Hybrid Redis + MongoDB

The application uses **two stores in parallel**, each optimised for its access pattern:

| Store | Holds | Why |
|---|---|---|
| **Redis** | Active tournaments (with embedded matches/games), match index | Sub-millisecond reads/writes for live tournament state |
| **MongoDB** | Player profiles, complete game history | Durable, disk-backed; survives Redis restarts; powers historical stats |

### How it works

- **Tournaments** live entirely in Redis. Every bracket mutation — recording a game, advancing a round — is a single atomic `SET` on the tournament JSON document.
- **Players** are stored in MongoDB. Their `tournamentIds` list is updated whenever they join a new tournament, but doesn't need Redis speed.
- **Games** are written to both: embedded inside the tournament document in Redis (for live match state) and as individual documents in MongoDB's `games` collection (for permanent history). `getAllGames()` and the stats API read from MongoDB.
- **Match index** lives in Redis as a hash (`matchId → tournamentId`), rebuilt automatically on startup, giving O(1) match lookups without scanning all tournaments.

See [docs/hybrid-storage-architecture.md](docs/hybrid-storage-architecture.md) for full schema details.

## Docs

| File | Description |
|------|-------------|
| [docs/hybrid-storage-architecture.md](docs/hybrid-storage-architecture.md) | Hybrid Redis + MongoDB architecture and data flow |
| [docs/hybrid-schema-clarification.md](docs/hybrid-schema-clarification.md) | Embedded vs. separate match storage trade-offs |
| [docs/bracket-requirements.md](docs/bracket-requirements.md) | Bracket tournament rules and format |
| [docs/player-stats-clarification.md](docs/player-stats-clarification.md) | How player stats are calculated |
| [docs/player-page-stats-solution.md](docs/player-page-stats-solution.md) | Player page stats implementation notes |
