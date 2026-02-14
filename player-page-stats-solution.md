# Player Page Stats with Hybrid Schema

## The Challenge
Player page needs **cross-tournament statistics**:
- All games a player has played
- Win/loss records across tournaments
- Average scores, win rates, etc.

## Current Implementation
```typescript
const getPlayerStats = (playerId: string) => {
  const playerGames = games.filter(game =>
    game.player1Id === playerId || game.player2Id === playerId
  );
  const playerMatches = matches.filter(match =>
    match.player1Id === playerId || match.player2Id === playerId
  );
  // Calculate comprehensive stats...
}
```

## Solution: Keep Games & Matches Global

**Hybrid Schema Refinement:**

```
# Tournament documents (embedded matches for tournament ops)
pingpong:tournament:{id} → Tournament + embedded matches

# Global entities (for player stats & cross-tournament queries)
pingpong:games → Array of all games
pingpong:matches → Array of all matches
pingpong:players → Array of all players

# Indexes
pingpong:active_tournaments → Sorted set
pingpong:completed_tournaments → Sorted set
pingpong:player_tournaments:{playerId} → Set of tournament IDs
```

## Why This Works

**Tournament Operations:** Use embedded matches (fast, atomic)
**Player Stats:** Use global games/matches arrays (comprehensive)

**Benefits:**
- ✅ Tournament details load fast (embedded matches)
- ✅ Player stats work unchanged (global arrays)
- ✅ No duplication of game/match data
- ✅ Best of both worlds

**Data Flow:**
- Tournament creation: Create embedded matches + add to global arrays
- Player stats: Query global games/matches (unchanged)
- Tournament details: Use embedded matches (faster)

**Migration:** Player page stats calculation requires ZERO changes!</content>
</xai:function_call name="run_in_terminal">
<parameter name="command">cd /Users/phil/code/pingpong && rm player-page-stats-solution.md