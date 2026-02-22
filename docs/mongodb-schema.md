# MongoDB Schema

## Collections

| Collection | Document shape | Purpose |
|---|---|---|
| `players` | `{ _id: playerId, id, name, tournamentIds[] }` | One document per player |
| `tournaments` | `{ _id: tournamentId, id, name, startDate, status, matches[], … }` | One document per tournament, with embedded matches and games |
| `match_index` | `{ _id: matchId, tournamentId }` | O(1) match → tournament lookup |

## Database naming

The database name is environment-scoped to prevent test/dev data from leaking into production:

| `NODE_ENV` | Database |
|---|---|
| `production` | `pingpong_production` |
| `development` | `pingpong_development` |
| `test` | `pingpong_test` |

## Why tournament documents embed matches and games

The access pattern is always **tournament → matches → games**. Embedding means:

- A single `findOne({ _id: tournamentId })` returns everything needed to render a tournament page.
- All round-advancement and game-recording operations are a single atomic `replaceOne`.
- No orphaned matches or games can exist.

## Why the match_index collection exists

Without it, looking up which tournament owns a given match requires scanning every tournament document — O(n). The `match_index` collection maps `matchId → tournamentId` directly, making the lookup O(1). It is rebuilt automatically from tournament documents on server startup (`migrateMatchIndex`).

## Player records

Players are stored as individual documents in the `players` collection. Each player carries a `tournamentIds` array that is updated via `syncTournamentPlayers()`, which is called **only** when a tournament's player roster changes (creation or player add/remove) — not on every game write.

## Stats

Player stats are computed server-side by `/api/stats`, which reads all tournament documents and aggregates game results. No denormalized stats counters are stored in MongoDB.
