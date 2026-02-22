# 🏓 Ping Pong Tracker

Match, player, tournament, and stats tracker for office ping pong. Built with Next.js and MongoDB.

## Features

- **Players** — add players, view per-player stats and match history
- **Tournaments** — create round-robin + bracket tournaments, advance rounds, track results
- **Stats** — leaderboard with win rate, games played, points per game
- **Live bracket** — bracket view with fireworks celebration on completion

## Getting Started

### Prerequisites

MongoDB is required for data storage. Start it with Docker Compose:

```bash
npm run mongodb:start  # Start MongoDB (via docker compose)
npm run mongodb:stop   # Stop MongoDB
```

Or bring up the full stack directly:

```bash
docker compose up -d mongodb
docker compose down
```

### MongoDB Configuration

Copy `.env.example` to `.env.local` and set your MongoDB URL:

```bash
# Local (no authentication)
MONGODB_URL=mongodb://localhost:27017

# Local with authentication
MONGODB_URL=mongodb://admin:mypassword@localhost:27017

# Remote
MONGODB_URL=mongodb://username:password@mongo.example.com:27017
```

The Docker Compose setup uses `MONGO_USERNAME` / `MONGO_PASSWORD` (defaults to `admin` / `mypassword`). Make sure `MONGODB_URL` in `.env.local` matches.

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data Model

Games are stored **inside matches**, which are stored **inside tournament documents** — the tournament is the single source of truth. A `match_index` MongoDB collection provides O(1) match → tournament lookups.

See [docs/mongodb-schema.md](docs/mongodb-schema.md) for full schema details.

## MongoDB vs Redis — Pros and Cons

### Why switch to MongoDB?

| | MongoDB | Redis |
|---|---|---|
| **Data model** | Rich documents, nested arrays, flexible schema | Flat key/value, strings, hashes, sorted sets |
| **Queries** | Native query language, filters, projections, aggregations | Manual key construction; no ad-hoc queries |
| **Persistence** | Durable by default (journal + data files) | Optional (AOF / RDB snapshots), primarily in-memory |
| **Memory** | Disk-backed; scales to large datasets | All data lives in RAM; cost grows with data size |
| **Transactions** | Multi-document ACID transactions | Single-key atomicity only (Lua scripts for multi-key) |
| **Tooling** | MongoDB Compass, Atlas UI, `mongosh` | `redis-cli`, RedisInsight |
| **Hosting** | MongoDB Atlas free tier | Redis Cloud free tier |
| **Schema validation** | Optional JSON Schema validation | None |

### Pros of MongoDB for this app

- **Natural document fit** — Tournament → Matches → Games is a nested document hierarchy that maps directly to MongoDB's BSON document model, removing the need to manually serialize/deserialize JSON.
- **Richer queries** — Finding active tournaments, filtering by player, or computing stats can be done with MongoDB query operators instead of loading all data client-side.
- **Built-in indexing** — Create indexes on `status`, `startDate`, or `players` without extra data structures.
- **Durability** — Data is written to disk by default; no risk of data loss on restart.
- **Horizontal scaling** — Sharding and replica sets are built into MongoDB for future growth.
- **Aggregation pipeline** — Stats (win rates, points per game) could be pushed to the database layer.

### Cons of MongoDB vs Redis

- **Higher latency for simple lookups** — Redis is an in-memory store and is faster for simple key/value operations like `GET`/`SET`.
- **Heavier resource footprint** — MongoDB uses more disk and CPU than Redis for equivalent small datasets.
- **More complex setup** — MongoDB requires a running `mongod` process; Redis is a single binary with no config needed.
- **No pub/sub or streams** — If real-time push notifications (e.g. live score updates) are added later, Redis has built-in pub/sub; MongoDB requires change streams.
- **Connection overhead** — MongoDB connections are heavier than Redis connections.

## Docs

| File | Description |
|------|-------------|
| [docs/mongodb-schema.md](docs/mongodb-schema.md) | MongoDB schema design and rationale |
| [docs/hybrid-schema-clarification.md](docs/hybrid-schema-clarification.md) | Embedded vs. separate match storage trade-offs |
| [docs/bracket-requirements.md](docs/bracket-requirements.md) | Bracket tournament rules and format |
| [docs/player-stats-clarification.md](docs/player-stats-clarification.md) | How player stats are calculated |
| [docs/player-page-stats-solution.md](docs/player-page-stats-solution.md) | Player page stats implementation notes |
