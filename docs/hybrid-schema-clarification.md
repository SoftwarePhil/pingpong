# Match Storage: Embedded vs Separate

## Implemented: Embedded Matches

Matches and their games live **inside** the tournament document:

```json
{
  "id": "123",
  "name": "Winter Championship",
  "status": "roundRobin",
  "players": ["p1", "p2", "p3", "p4"],
  "matches": [
    {
      "id": "m1",
      "player1Id": "p1",
      "player2Id": "p2",
      "round": "roundRobin",
      "bestOf": 1,
      "games": [
        { "id": "g1", "score1": 11, "score2": 7, ... }
      ],
      "winnerId": "p1"
    }
  ]
}
```

### Why embedded

| Reason | Detail |
|--------|--------|
| **Single round-trip** | `GET pingpong:tournament:{id}` returns the full tournament, matches, and games in one call |
| **Atomic writes** | Advancing a round, recording a game, completing a tournament — all single `SET` operations |
| **No orphan risk** | Matches and games can't exist without a tournament |
| **Matches the UI** | Every view navigates tournament → matches → games; co-location is ideal |

### Cross-tournament match lookup

Embedding makes per-match lookups indirect. This is solved by `pingpong:match_index` — a Redis Hash that maps `matchId → tournamentId`. Any API that receives a `matchId` does one `HGET` to find the tournament, then operates on the embedded match. The index is rebuilt from tournament documents on startup.

## The alternative that was considered

Separate `pingpong:match:{id}` keys with the tournament storing only `matchIds[]`. This would allow querying matches independently but requires multiple round-trips for any tournament view and introduces consistency risk (tournament and match can diverge). Not worth the tradeoff at this scale.
</content>
</xai:function_call name="run_in_terminal">
<parameter name="command">cd /Users/phil/code/pingpong && rm hybrid-schema-clarification.md