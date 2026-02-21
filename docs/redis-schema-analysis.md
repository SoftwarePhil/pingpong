# Redis Schema

## Implemented Schema

### Keys

| Key | Type | Contents |
|-----|------|----------|
| `pingpong:players` | String (JSON) | Array of all `Player` objects |
| `pingpong:tournament:{id}` | String (JSON) | Full `Tournament` document including embedded matches and games |
| `pingpong:active_tournaments` | Sorted Set | Tournament IDs scored by `startDate` timestamp |
| `pingpong:completed_tournaments` | Sorted Set | Tournament IDs scored by `startDate` timestamp |
| `pingpong:match_index` | Hash | `{ matchId → tournamentId }` for O(1) match lookups |

### Why tournament documents embed matches and games

The access pattern is always **tournament → matches → games**. Embedding means:

- A single `GET pingpong:tournament:{id}` returns everything needed to render a tournament page
- All round-advancement and game-recording operations are a single atomic write
- No orphaned matches or games can exist

### Why the match index exists

Without it, looking up which tournament owns a given match requires scanning every tournament document — O(n). The `pingpong:match_index` hash maps `matchId → tournamentId` directly, making the lookup O(1). It is rebuilt automatically from tournament documents on server startup (`migrateMatchIndex`).

### Player records

Players are stored as a flat JSON array under `pingpong:players`. Each player object carries a `tournamentIds` list that is updated via `syncTournamentPlayers()`, which is called **only** when a tournament's player roster changes (creation or player add/remove) — not on every game write.

## What was removed

The following keys existed in an earlier schema and have been removed:

| Old Key | Why removed |
|---------|-------------|
| `pingpong:matches` | Duplicate of `tournament.matches[]`; caused sync drift |
| `pingpong:games` | Duplicate of `tournament.matches[].games[]`; caused sync drift |
| `pingpong:tournaments` | Legacy fallback array; superseded by per-document keys |

## Stats

Player stats are computed server-side by `/api/stats`, which reads all tournament documents and aggregates game results. No denormalized stats counters are stored in Redis.
### Migration Strategy
1. Keep existing API contracts
2. Implement new schema alongside old
3. Migrate data gradually
4. Update data layer to use new schema
5. Remove old schema after verification

Would you like me to implement the hybrid schema?</content>
</xai:function_call">## Redis Schema Analysis & Recommendations

Based on my analysis of your current Redis implementation, here are the key findings and alternative schema proposals:

## Current Implementation Issues

**Current Schema:**
- 4 separate keys storing JSON arrays: `pingpong:players`, `pingpong:tournaments`, `pingpong:matches`, `pingpong:games`
- Every operation loads/saves entire arrays
- No relationships stored in Redis (computed at runtime)

**Problems:**
1. **Performance**: O(n) operations on growing datasets
2. **Scalability**: Loading entire arrays when only subsets needed  
3. **Atomicity**: Related updates across multiple keys aren't transactional
4. **Memory Inefficient**: Unnecessary data transfer

## Alternative Schema Options

### Option 1: Document-Based Schema (Recommended for Your Use Case)
Store complete tournament documents with embedded relationships:

```
pingpong:tournament:{id} → Tournament + embedded matches/games
pingpong:players → Player array (global, rarely changes)
pingpong:active_tournaments → Set of active tournament IDs
pingpong:completed_tournaments → Sorted set by completion date
```

**Benefits:**
- Atomic tournament operations
- Single round-trip for tournament data
- Better data locality
- Matches your tournament-centric access patterns

### Option 2: Normalized Schema with Indexes
Use Redis hashes and sets for proper indexing:

```
pingpong:players:{id} → Player hash
pingpong:tournaments:{id} → Tournament hash  
pingpong:matches:{id} → Match hash
pingpong:games:{id} → Game hash

# Indexes
pingpong:tournament_matches:{tournamentId} → Set of match IDs
pingpong:match_games:{matchId} → Set of game IDs
pingpong:active_tournaments → Set of tournament IDs
```

**Benefits:**
- Minimal data duplication
- Fast lookups by ID
- Efficient filtering
- Highly scalable

### Option 3: Hybrid Schema (Best Overall)
Combine document and indexed approaches:

```
# Tournament documents (with embedded data)
pingpong:tournament:{id} → Full tournament with matches/games

# Global entities  
pingpong:players:{id} → Player hash
pingpong:players → Set of all player IDs

# Indexes for queries
pingpong:active_tournaments → Sorted set by start date
pingpong:completed_tournaments → Sorted set by completion date
pingpong:player_tournaments:{playerId} → Set of tournament IDs
```

## Recommendation

For your pingpong application, I recommend the **Hybrid Schema (Option 3)** because:

1. **Tournament-Centric**: Most operations revolve around individual tournaments
2. **Current Scale**: Small dataset where tournament operations dominate
3. **Query Patterns**: Need both detailed tournament views and filtered lists
4. **Performance Balance**: Optimizes for your specific access patterns

**Does it make sense to store everything in one document?**
- **No** for the entire application (too much duplication, complex updates)
- **Yes** for individual tournaments (atomic operations, better performance)

The hybrid approach gives you the best of both worlds: fast tournament operations with efficient global queries.

Would you like me to implement the hybrid schema with a migration plan? This would significantly improve performance as your data grows. 🚀</content>
</xai:function_call">## Redis Schema Analysis & Recommendations

Based on my analysis of your current Redis implementation, here are the key findings and alternative schema proposals:

## Current Implementation Issues

**Current Schema:**
- 4 separate keys storing JSON arrays: `pingpong:players`, `pingpong:tournaments`, `pingpong:matches`, `pingpong:games`
- Every operation loads/saves entire arrays
- No relationships stored in Redis (computed at runtime)

**Problems:**
1. **Performance**: O(n) operations on growing datasets
2. **Scalability**: Loading entire arrays when only subsets needed  
3. **Atomicity**: Related updates across multiple keys aren't transactional
4. **Memory Inefficient**: Unnecessary data transfer

## Alternative Schema Options

### Option 1: Document-Based Schema (Recommended for Your Use Case)
Store complete tournament documents with embedded relationships:

```
pingpong:tournament:{id} → Tournament + embedded matches/games
pingpong:players → Player array (global, rarely changes)
pingpong:active_tournaments → Set of active tournament IDs
pingpong:completed_tournaments → Sorted set by completion date
```

**Benefits:**
- Atomic tournament operations
- Single round-trip for tournament data
- Better data locality
- Matches your tournament-centric access patterns

### Option 2: Normalized Schema with Indexes
Use Redis hashes and sets for proper indexing:

```
pingpong:players:{id} → Player hash
pingpong:tournaments:{id} → Tournament hash  
pingpong:matches:{id} → Match hash
pingpong:games:{id} → Game hash

# Indexes
pingpong:tournament_matches:{tournamentId} → Set of match IDs
pingpong:match_games:{matchId} → Set of game IDs
pingpong:active_tournaments → Set of tournament IDs
```

**Benefits:**
- Minimal data duplication
- Fast lookups by ID
- Efficient filtering
- Highly scalable

### Option 3: Hybrid Schema (Best Overall)
Combine document and indexed approaches:

```
# Tournament documents (with embedded data)
pingpong:tournament:{id} → Full tournament with matches/games

# Global entities  
pingpong:players:{id} → Player hash
pingpong:players → Set of all player IDs

# Indexes for queries
pingpong:active_tournaments → Sorted set by start date
pingpong:completed_tournaments → Sorted set by completion date
pingpong:player_tournaments:{playerId} → Set of tournament IDs
```

## Recommendation

For your pingpong application, I recommend the **Hybrid Schema (Option 3)** because:

1. **Tournament-Centric**: Most operations revolve around individual tournaments
2. **Current Scale**: Small dataset where tournament operations dominate
3. **Query Patterns**: Need both detailed tournament views and filtered lists
4. **Performance Balance**: Optimizes for your specific access patterns

**Does it make sense to store everything in one document?**
- **No** for the entire application (too much duplication, complex updates)
- **Yes** for individual tournaments (atomic operations, better performance)

The hybrid approach gives you the best of both worlds: fast tournament operations with efficient global queries.

Would you like me to implement the hybrid schema with a migration plan? This would significantly improve performance as your data grows. 🚀</content>
</xai:function_call name="run_in_terminal">
<parameter name="command">cd /Users/phil/code/pingpong && rm redis-schema-analysis.md