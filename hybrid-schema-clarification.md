# Hybrid Schema Clarification: Match Storage Options

## Option 3A: Embedded Matches (Recommended)
```
pingpong:tournament:{id} → {
  id: "123",
  name: "Winter Championship",
  status: "active",
  players: ["p1", "p2", "p3", "p4"],
  matches: [
    {
      id: "m1",
      player1Id: "p1",
      player2Id: "p2",
      round: "roundRobin",
      games: [...]
    },
    {
      id: "m2",
      player1Id: "p3",
      player2Id: "p4",
      round: "roundRobin",
      games: [...]
    }
  ]
}
```

**Pros:**
- ✅ Single round-trip for complete tournament data
- ✅ Atomic tournament operations
- ✅ Data consistency (matches can't exist without tournament)
- ✅ Matches always co-located with tournament
- ✅ Perfect for your tournament-centric UI

**Cons:**
- ❌ Can't query matches across tournaments easily
- ❌ Slightly more data duplication

## Option 3B: Separate Match Entities
```
pingpong:tournament:{id} → {
  id: "123",
  name: "Winter Championship",
  status: "active",
  players: ["p1", "p2", "p3", "p4"],
  matchIds: ["m1", "m2", "m3"]
}

pingpong:match:{id} → {
  id: "m1",
  tournamentId: "123",
  player1Id: "p1",
  player2Id: "p2",
  round: "roundRobin",
  games: [...]
}
```

**Pros:**
- ✅ More normalized
- ✅ Can query matches independently
- ✅ Less data duplication
- ✅ More flexible for complex queries

**Cons:**
- ❌ Multiple round-trips to get tournament + matches
- ❌ More complex to maintain consistency
- ❌ Overkill for your current access patterns

## Recommendation: Option 3A (Embedded Matches)

**Why embedded matches are better for your pingpong app:**

1. **Access Patterns**: Your UI always shows tournament → matches → games
2. **Atomicity**: Tournament operations need to be atomic (advancing rounds, completion)
3. **Performance**: Single Redis GET for tournament details page
4. **Simplicity**: Matches have no independent lifecycle outside tournaments
5. **Consistency**: No orphaned matches or sync issues

**Current API Usage Analysis:**
- `GET /api/tournaments` - lists tournaments
- `GET /api/matches?tournamentId=X` - gets matches for tournament
- Tournament detail pages load tournament + all its matches

**With embedded matches:**
- `GET pingpong:tournament:{id}` returns everything needed
- No separate match queries needed
- Perfect for your current UI patterns

**Migration Impact:**
- Minimal API changes (internal data structure only)
- Better performance for tournament detail views
- Simplified data layer logic</content>
</xai:function_call name="run_in_terminal">
<parameter name="command">cd /Users/phil/code/pingpong && rm hybrid-schema-clarification.md