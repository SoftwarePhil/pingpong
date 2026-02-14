# Redis Schema Analysis & Alternatives

## Current Implementation Analysis

### Current Schema
- **4 separate keys**: `pingpong:players`, `pingpong:tournaments`, `pingpong:matches`, `pingpong:games`
- **Storage**: Each key contains a JSON array of all items
- **Operations**: Load entire arrays → modify → save entire arrays

### Problems Identified
1. **Performance**: Every operation loads/saves entire datasets
2. **Scalability**: O(n) operations on growing datasets
3. **Atomicity**: Related updates across multiple keys aren't transactional
4. **Memory**: Unnecessary data loading when only subsets needed
5. **Relationships**: No stored relationships, all computed at runtime

## Alternative Schema Proposals

### Option 1: Document-Based Schema (Recommended)
Store complete tournament documents with embedded relationships:

```
pingpong:tournament:{id} → Tournament document with embedded matches/games
pingpong:players → Player array (global, rarely changes)
pingpong:active_tournaments → Set of active tournament IDs
pingpong:completed_tournaments → Sorted set by completion date
```

**Pros:**
- Atomic tournament operations
- Reduced network round trips
- Better data locality
- Easier querying of tournament data

**Cons:**
- Data duplication (players in tournaments)
- More complex updates for shared data

### Option 2: Normalized Schema with Indexes
Use Redis hashes and sets for better indexing:

```
pingpong:players:{id} → Player hash
pingpong:tournaments:{id} → Tournament hash
pingpong:matches:{id} → Match hash
pingpong:games:{id} → Game hash

# Indexes
pingpong:tournament_matches:{tournamentId} → Set of match IDs
pingpong:match_games:{matchId} → Set of game IDs
pingpong:player_tournaments:{playerId} → Set of tournament IDs
pingpong:active_tournaments → Set of tournament IDs
```

**Pros:**
- Minimal data duplication
- Fast lookups by ID
- Efficient filtering/indexing
- Scalable for large datasets

**Cons:**
- More complex queries require multiple round trips
- Index maintenance overhead

### Option 3: Hybrid Schema (Best of Both)
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

**Pros:**
- Fast tournament-centric operations
- Efficient global queries
- Balanced complexity
- Good for current access patterns

**Cons:**
- Some data duplication
- More complex schema management

## Recommendation: Hybrid Schema

For your pingpong application, I recommend **Option 3 (Hybrid Schema)** because:

1. **Tournament-Centric Access**: Most operations are tournament-focused
2. **Current Scale**: Small dataset, tournament operations dominate
3. **Query Patterns**: Need both individual tournament details and filtered lists
4. **Performance**: Balances read/write performance for your use case

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