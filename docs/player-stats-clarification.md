# Player Stats Calculation with Embedded Matches

## Current Implementation
```typescript
const getPlayerStandings = (tournamentId: string, players: string[]) => {
  // Filter all matches by tournamentId
  const tournamentMatches = matches.filter(m =>
    m.tournamentId === tournamentId && m.round === 'roundRobin'
  );
  // Calculate wins/losses...
}
```

## With Embedded Matches (Hybrid Schema)
```typescript
const getPlayerStandings = (tournament: Tournament, players: string[]) => {
  // Get matches directly from tournament document
  const tournamentMatches = tournament.matches.filter(m =>
    m.round === 'roundRobin'
  );
  // Same calculation logic...
}
```

**Benefits:**
- ✅ **Faster**: No need to filter global matches array
- ✅ **Simpler**: Direct access to tournament's matches
- ✅ **Atomic**: Tournament document contains all needed data
- ✅ **Consistent**: No sync issues between tournament and matches

## API Layer Changes
**Current:** `getMatches()` loads all matches globally
**New:** `getTournament(id)` loads tournament with embedded matches

**UI Code Changes:** Minimal
```typescript
// Current
const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id);

// New
const tournamentMatches = tournament.matches;
```

## Performance Comparison

| Operation | Current (Arrays) | Hybrid (Embedded) |
|-----------|------------------|-------------------|
| Load tournament details | 2 Redis GETs (tournament + matches) | 1 Redis GET |
| Calculate standings | Filter large array | Direct access |
| Memory usage | Load all matches | Load tournament only |

**Result:** ~50% fewer Redis operations, faster standings calculation!</content>
</xai:function_call name="run_in_terminal">
<parameter name="command">cd /Users/phil/code/pingpong && rm player-stats-clarification.md