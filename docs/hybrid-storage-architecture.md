# Hybrid Storage Architecture: Redis + MongoDB

The application uses **two data stores in parallel**, each optimised for its workload.

## Store responsibilities

| Store | What it holds | Why |
|---|---|---|
| **Redis** | Active tournaments (with embedded matches/games), match index, active/completed sorted sets | Sub-millisecond reads/writes; perfect for live tournament state that changes frequently |
| **MongoDB** | Player profiles, complete game history | Durable, disk-backed; survives Redis restarts; enables historical queries and analytics |

## Key layout

### Redis (real-time tournament state)

| Key | Type | Contents |
|-----|------|----------|
| `{ENV}:pingpong:tournament:{id}` | String (JSON) | Full `Tournament` document including embedded matches and games |
| `{ENV}:pingpong:active_tournaments` | Sorted Set | Active tournament IDs scored by `startDate` timestamp |
| `{ENV}:pingpong:completed_tournaments` | Sorted Set | Completed tournament IDs scored by `startDate` timestamp |
| `{ENV}:pingpong:match_index` | Hash | `{ matchId → tournamentId }` for O(1) match lookups |

### MongoDB (durable long-term storage)

Database: `pingpong_{NODE_ENV}` (e.g. `pingpong_production`, `pingpong_test`)

| Collection | Document shape | Contents |
|---|---|---|
| `players` | `{ _id: playerId, name, tournamentIds[] }` | One document per player; updated whenever a player joins a tournament |
| `games` | `{ _id: gameId, matchId, player1Id, player2Id, score1, score2, date }` | Every game ever played; written/updated whenever a game is recorded |

## Data flow

### Recording a game (`addGameToMatch`)
1. Read the tournament from **Redis** (O(1) via match index hash)
2. Append the game, recalculate the match winner, write the tournament back to **Redis**
3. Upsert the game document into the **MongoDB** `games` collection (non-blocking write for history)

### Updating or removing a game
- Same pattern: Redis is updated first; MongoDB games collection is kept in sync

### Player updates (`syncTournamentPlayers`)
- Reads/writes the `players` collection in **MongoDB** only — player profiles don't need Redis speed

### Stats (`/api/stats`)
- `getAllGames()` reads from the MongoDB `games` collection — efficient even as history grows

## Why not store everything in one place?

| Question | Answer |
|---|---|
| **Why not Redis-only?** | Redis is in-memory; game history would be lost on restart or eviction. Player profiles are stable reference data, not real-time state. |
| **Why not MongoDB-only?** | MongoDB adds latency for every tournament mutation. Tournament bracket state changes on every game play — Redis's O(1) JSON SET/GET keeps that fast. |
| **Why embed matches/games in the tournament Redis document?** | The tournament page needs all matches and games in one call. Embedding makes every tournament render a single `GET`. The match index provides the reverse lookup without scanning all documents. |

## Environment isolation

Both stores are environment-scoped:
- Redis keys use the prefix `{NODE_ENV}:pingpong:…`
- MongoDB uses the database `pingpong_{NODE_ENV}`

This ensures test, development, and production data never mix.
