# Bracket Tournament Requirements

## Overview

Tournaments run in two phases: **Round Robin** followed by a **Single-Elimination Bracket**. The bracket seeds players by their round-robin performance and guarantees the top two seeds can only meet in the final.

---

## Phase 1 — Round Robin

### Structure
- Players are randomly paired each round (shuffled).
- If the active player count is odd, one player receives a bye (automatic win).
- The number of rounds is configured when the tournament is created.
- Only **active players** (`activePlayers` field, defaults to all players) participate in current and future rounds.

### Player Management During Round Robin
- **Removing a player**: unplayed matches in the current round involving that player are deleted. Completed matches are preserved for stats.
- **Adding 1 player**: if a bye match exists in the current round, it is converted into a real match against the new player. Otherwise the player is included from the next round onward.
- **Adding 2+ players at once**: new players are paired against each other first (two at a time) and new matches are created for the current round. Any single leftover follows the single-player rule above.

### Advancement
- The host manually advances rounds after all current-round matches are complete.
- After the final configured round, the tournament transitions to the bracket phase.

---

## Phase 2 — Single-Elimination Bracket

### Seeding
- Players are ranked by round-robin wins (descending). Ties are broken randomly.
- Only active players enter the bracket.
- The ranking is stored on the tournament as `playerRanking`.

### Bracket Generation — `generateBracketSeeding(n)`
- `n` must be a power of 2.
- Uses a recursive interleave algorithm to produce standard tournament seeding.
- Example for `n = 8`: `[1, 8, 4, 5, 2, 7, 3, 6]`
- This guarantees:
  - Seeds 1 and 2 are in opposite halves and can only meet in the **final**.
  - Seeds 1–4 can only meet in the **semis** or later.

### Visual Layout
- Seed 1 is placed at the **top** of the bracket.
- Seed 2 is placed at the **bottom** of the bracket.
- This is achieved by reversing the bottom half of the generated match list after creation.

### Bye Handling (non-power-of-2 player counts)
- The bracket size is rounded up to the next power of 2.
- Slots beyond the actual player count are filled with **BYE**.
- Bye matches are auto-won immediately (no games required).
- Top seeds receive byes (they occupy the lowest-numbered seed slots, which map to BYE opponents).

### Odd Player Count — Play-In Match
- If the active player pool is **odd**, the two lowest seeds play a **play-in match** (bracketRound = 0) before the main bracket begins.
- The winner enters the main bracket as `PLAY_IN_WINNER` and takes the last seed slot.
- When the play-in match is completed, the main bracket is created (seeded as above) with the actual winner substituted in.

### Bracket Advancement
- After every match in a round is completed, the host advances to the next round.
- Winners from consecutive pairs advance; they are matched in the order determined at bracket creation (seeding structure is fixed).
- Tournament completes when the final match (single match in the highest round) produces a winner.

---

## Bracket Examples

### 4 Players → bracket size 4
| Round | Match | Players |
|-------|-------|---------|
| R1 (Semifinal) | M1 | Seed 1 vs Seed 4 |
| R1 (Semifinal) | M2 | Seed 3 vs Seed 2 |
| R2 (Final) | M3 | Winner M1 vs Winner M2 |

Seeds 1 and 2 cannot meet until the final. ✓

### 6 Players → bracket size 8 (2 byes)
Seeding slots: `[1,8, 4,5, 2,7, 3,6]` → after bottom-half reversal, match order:

| Position | Match | Players |
|----------|-------|---------|
| Top | M1 | Seed 1 vs **BYE** → auto-win Seed 1 |
| | M2 | Seed 4 vs Seed 5 |
| | M3 | Seed 3 vs Seed 6 |
| Bottom | M4 | Seed 2 vs **BYE** → auto-win Seed 2 |

Seeds 1 and 2 are at opposite ends. They can only meet in the final. ✓

### 5 Players → play-in + bracket size 4
- Play-in: Seed 4 vs Seed 5
- Main bracket (4 slots): Seed 1 vs Play-in Winner (bottom), Seed 2 vs Seed 3 (top)  
  *(bottom half reversed so Seed 1 is top, Play-in Winner is bottom)*

### 7 Players → play-in + bracket size 8 (with byes)
- Play-in: Seed 6 vs Seed 7
- Main bracket: 6 players (5 seeds + Play-in Winner slot) → size 8 with 2 byes, same seeding rules apply.

---

## Implementation Files

| File | Responsibility |
|------|---------------|
| `src/lib/tournament.ts` | `generateBracketSeeding`, `createSeededBracketMatches`, `createBracketMatches`, `advanceRoundRobinRound`, `advanceBracketRound`, `createRoundRobinPairings` |
| `src/app/api/tournaments/route.ts` | Tournament CRUD, player add/remove logic, round advancement, bracket creation trigger |
| `src/app/api/games/route.ts` | Game recording; triggers main bracket creation after play-in match completes |
| `src/app/tournaments/active/BracketView.tsx` | Visual bracket rendering; seed 1 top, seed 2 bottom |
| `src/__tests__/tournament.test.ts` | Unit tests for all bracket and round-robin logic |
