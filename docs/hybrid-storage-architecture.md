# Hybrid Storage Architecture: Redis + MongoDB

The application uses **two data stores in parallel**, each optimised for its workload.

## Store responsibilities

| Store | What it holds | Why |
|---|---|---|
| **Redis** | Active tournament documents (with embedded matches/games), active tournament ID set, match index | Sub-millisecond reads/writes for live tournament state that changes frequently |
| **MongoDB** | Completed tournament documents, player profiles, complete game history | Durable, disk-backed; survives Redis restarts; enables historical queries |

## Key layout

### Redis (real-time active tournament state)

| Key | Type | Contents |
|-----|------|----------|
| `{ENV}:pingpong:tournament:{id}` | String (JSON) | Full `Tournament` document for **active** tournaments (status `roundRobin` or `bracket`) |
| `{ENV}:pingpong:active_tournaments` | Sorted Set | Active tournament IDs scored by `startDate` timestamp |
| `{ENV}:pingpong:match_index` | Hash | `{ matchId → tournamentId }` for O(1) match lookups |

### MongoDB (durable long-term storage)

Database: `pingpong_{NODE_ENV}` (e.g. `pingpong_production`, `pingpong_test`)

| Collection | Document shape | Contents |
|---|---|---|
| `tournaments` | `{ _id: tournamentId, name, status: 'completed', matches[], … }` | **Completed** tournament documents, moved from Redis on completion |
| `players` | `{ _id: playerId, name, tournamentIds[] }` | One document per player |
| `games` | `{ _id: gameId, matchId, player1Id, player2Id, score1, score2, date }` | Every game ever played |

## Data flow

### Tournament lifecycle

1. **Created / active** — tournament document written to Redis (`tournament:{id}` key), ID added to `active_tournaments` sorted set.
2. **Completed** — `setTournament` moves the document to MongoDB `tournaments` collection, removes the Redis key and removes the ID from `active_tournaments`. The match index entries remain in Redis for fast lookups.
3. **Read** (`getTournament`) — checks Redis first; if not found (tournament is completed), falls back to MongoDB.
4. **List all** (`getTournaments`) — active tournaments fetched from Redis via `active_tournaments` set; completed tournaments fetched directly from MongoDB `tournaments` collection.

### Recording a game (`addGameToMatch`)
1. Look up the tournament via the Redis match index (O(1))
2. Append the game, recalculate the match winner, write the tournament back to Redis
3. Upsert the game document into the MongoDB `games` collection (non-fatal write for history)

### Player updates (`syncTournamentPlayers`)
- Reads/writes the `players` collection in MongoDB only.

### Stats (`/api/stats`)
- `getAllGames()` reads from the MongoDB `games` collection — efficient even as history grows.

## Why only active_tournaments in Redis?

| Question | Answer |
|---|---|
| **Why not completed tournaments in Redis too?** | Completed tournaments are immutable — they never change after completion. Keeping them in Redis wastes memory. MongoDB is the right home for stable historical data. |
| **Why keep active tournaments in Redis?** | Active tournament state changes on every game play. Redis O(1) JSON `GET`/`SET` keeps bracket mutations fast. |
| **Why keep match_index in Redis?** | The match index is used during live play to route game writes to the right tournament. It covers all tournaments (active and completed) to support lookups of any historical match. |

## Environment isolation

Both stores are environment-scoped:
- Redis keys use the prefix `{NODE_ENV}:pingpong:…`
- MongoDB uses the database `pingpong_{NODE_ENV}`

This ensures test, development, and production data never mix.
