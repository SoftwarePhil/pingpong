# Bracket Tournament Requirements

## Overview

Tournaments run in two phases: **Round Robin** followed by a **Single-Elimination Bracket**. The bracket seeds players by their round-robin performance. 

The play-in is configurable via preview controls and `bracketConfig.playInMode`:
- When a play-in is present (auto for odd counts, or forced), enough preliminary play-in matches (bracketRound 0) are created to reduce the field to the next lower power of two. The main bracket is then generated from the direct entrants plus one indexed placeholder per qualifier. This produces a clean power-of-2 main bracket whose first round ("round 1" after the play-in) has no extra BYEs for the advancers.
- For 9 players + play-in: 1 play-in match + 4 matches in the main bracket R1 (8-player power-of-2 bracket; the 7 top seeds + play-in winner all play real matches in the round of 8).
- For 10 players + play-in: 2 play-in matches + 4 matches in the main bracket R1 (8-player power-of-2 bracket; 6 direct entrants + 2 play-in winners, with no main-R1 byes).
- When play-in is removed for an odd count ('none'), the full n is used → power-of-2 R1 will contain BYEs for the top/excess players in round 1.

This document reflects the current implemented behavior (prelim play-in + reduced main when play-in present), the preview-time configurability (add/force/remove play-in, explicit bye assignment), and the rationale.

---

## Phase 1 — Round Robin

### Structure
- Players are randomly paired each round (shuffled). Alternative strategy "top-vs-top" is supported via `rrPairingStrategy`.
- If the active player count is odd, one player receives a bye (automatic win).
- The number of rounds is configured when the tournament is created.
- Only **active players** (`activePlayers` field, defaults to all players) participate in current and future rounds.

### Player Management During Round Robin
Adding/removing players is its **own atomic operation**, deliberately separate from the main tournament PUT endpoint: `PATCH /api/tournaments/[id]/players` with a diff-based body `{ add?: string[], remove?: string[] }`. The server computes the resulting roster/active-player lists itself and, in the same request, resyncs the current round's matches via `resyncRoundRobinMatches` (`src/lib/tournament.ts`) — a single call either fully applies the roster change *and* fixes up matches, or fails with no partial/duplicated state.

`resyncRoundRobinMatches` always rebuilds the "needs a match" pool for the current round from scratch (rather than patching individual matches in place), which is what makes it safe to run repeatedly without ever producing duplicate pairings:
- **A player who hasn't played gets added back to the pool.** This covers brand-new players, reactivated players (previously removed but never played), and players whose opponent was just removed — anyone active without a real result this round is eligible to be re-paired.
- **Players who have played don't change.** A match with a recorded game, or a genuine (non-BYE) winner, is left completely untouched, in every round — including matches whose participant was later removed (kept for historical accuracy).
- **Players who haven't played and get removed are dropped from every unplayed match they're in** — not just the current round. Stale unplayed leftovers from earlier rounds are also cleaned up defensively.
- A BYE match is intentionally **not** treated as "played for real": the bye holder always returns to the pool so they can be matched against anyone newly added/reactivated instead of auto-winning by default.
- The pool is paired via `createRoundRobinPairings`, honoring `rrPairingStrategy` (`top-vs-top` ranks the pool by current standings before pairing; `random` shuffles it) — the same pairing engine used everywhere else, so there is a single source of truth for how matches get built.

**Refreshing matches on demand:** `POST /api/tournaments/[id]/refresh-matches` runs the exact same `resyncRoundRobinMatches` resync without changing the roster at all. Roster edits already resync automatically as part of the PATCH above; this endpoint exists purely so the host can re-trigger the same fix-up on demand (e.g. a "🔄 Refresh Matches" button next to "Current Matches" in the UI) if matches ever look out of sync. Both endpoints reject requests once the bracket has started or the tournament is completed.

### Advancement
- The host manually advances rounds after all current-round matches are complete.
- After the final configured round, the tournament transitions to the bracket phase (via the "Start Bracket" action in the UI).

---

## Phase 2 — Single-Elimination Bracket

### Optional Third-Place Match
- A tournament may enable `bracketConfig.thirdPlaceMatch` when it is created.
- After both semifinal matches are complete, advancement creates the final and one `isThirdPlace` match together.
- If the option was not enabled initially, the host can use `action=addThirdPlaceMatch` after both semifinals complete and before the tournament is completed.
- The placement match is seeded with the two semifinal losers and uses the semifinal best-of format.
- The tournament remains active until both the final and the third-place match are complete.
- If a semifinal result is corrected, the final winner slot and corresponding third-place loser slot are corrected together; any invalidated placement games are removed from history.

### Seeding
- Players are ranked by round-robin wins (descending). Ties are broken by point differential, then randomly.
- If no round-robin games have been played, the active player pool is shuffled for random seeding.
- Once any round-robin game exists, active players with no recorded games are placed after every player who has played; played players are ranked by wins and point differential.
- Only active players enter the bracket.
- The ranking is stored on the tournament as `playerRanking` (best first).

### Bracket Generation
- Without a play-in, we generate for the **full** count of active players `n` and round up to the next power of 2 for R1 slot count.
- With a play-in, the field is reduced by preliminary qualifiers to the largest power of 2 below `n` (or by one forced qualifier when `n` is already a power of 2).
- `generateBracketSeeding(n)` (recursive interleave) produces standard protection:
  - Example for `n = 8`: `[1,8, 4,5, 2,7, 3,6]`
  - Guarantees seeds 1 and 2 meet only in the final, 1-4 only in semis, etc.
- After generating matches for the power-of-2 slots, the bottom half is reversed so seed 1 appears at the top of the visual bracket and seed 2 at the bottom.
- `createSeededBracketMatches` (and the caller `createBracketMatches`) implement this.

### Configurability — Play-In Round and Byes (`bracketConfig`)
A `bracketConfig` object (stored on the `Tournament`) controls play-in behavior:

- `playInMode`: `'auto' | 'force' | 'none'`
  - `'auto'` (default): for odd active count, create enough preliminary play-in matches to reach the lower power of two. For 9 players this yields 1 play-in + 4 clean matches in the main bracket's first round; for 7 players it yields 3 play-ins + 2 clean matches.
  - `'force'`: same reduction rule, but force at least one preliminary match even on a power-of-two field. For example, 10 players yields 2 play-ins and an 8-player main bracket; 8 players yields 1 play-in and a 4-player main bracket with one bye.
  - `'none'`: for odd count, do *not* create a play-in. Seed the full n → power-of-2 R1 will contain BYEs for the top/excess players in round 1 (the "remove play-in / use bye instead" behavior).

- `byePlayerIds` (optional): explicit list of players who must receive a R1 bye. After initial seeding, a cascade re-pairing (same logic used in live swaps) moves the desired players into bye slots and displaces others. This works in preview and is respected on "Start Bracket".

**Rationale for prelim play-in + reduced main (when play-in present):**
- For odd counts (or forced), qualifiers are added until the main bracket is a clean power of two. For 9 players this is "1 play-in and then 4 matches"; for 10 players it is "2 play-ins and then 4 matches". The main bracket's first round has all advancers playing real matches, without padding BYEs inside the main R1.
- Top seeds play their first match in the main bracket's R1 (round of 8 for 9 players) rather than getting a "bye from round of 16".
- Indexed `PLAY_IN_WINNER` placeholders + lazy substitution on play-in completion allow the full bracket diagram (including every feeder into its correct R1 slot) to be visible and editable in preview even before the play-in games are played.
- "Remove play-in" (none on odd) produces the larger R1 with BYEs for the top players, which is the configurable alternative.
- Preview controls (`+ Add / Force play-in round`, `− Remove play-in (use bye instead)`, `Auto`) + click-to-reassign (including on the play-in card and bye cards) and "Start Bracket with Current Preview" give safe experimentation before commit.
- Legacy round-0 play-ins continue to work.

### Bye Handling (non-power-of-2 player counts)
- R1 size = next power of 2.
- Excess slots become **BYE** (auto-won, no games).
- Top seeds (lowest indices in `playerRanking`) are placed in the positions that receive BYE.
- Explicit `byePlayerIds` (from preview) can override which players receive the BYEs (post-seeding cascade re-pairing).
- Bye matches carry `winnerId` immediately and are eligible for player swaps (both before and after "Start Bracket").

### Play-In Matches (Odd Count or Forced) — Preliminary + Reduced Main
- When `shouldPlayIn` (auto for odd, or force), create the minimum number of preliminary matches as **bracketRound 0**, pairing the lowest seeds.
- Then (if creating the main bracket) generate R1 from the direct entrants plus one indexed `PLAY_IN_WINNER` placeholder per qualifier.
- The main R1 is a clean power-of-2 bracket (for 9 players: 8 slots → 4 matches; for 10 players: 8 slots → 4 matches). All advancers play real matches in the main bracket's first round.
- Each placeholder is later substituted with its matching play-in winner when that game is recorded, allowing every feeder and R1 slot to be shown in preview.
- When `playInMode = 'none'` on odd: no preliminary; full n seeding is used (BYEs appear in R1 for the top/excess players).
- For force on even count: still create the prelim play-in + main on (n-1) slots (the resulting main R1 may contain BYEs if n-1 is not a power of 2).

### Visual Layout (BracketView)
- When play-ins (round 0) are present, they render in a dedicated left "Play-in" column, with one connector per play-in feeding its indexed R1 placeholder (or the real name after substitution).
- The main bracket R1 (the reduced power-of-2 matches) renders in the next column(s). For 9 players + play-in this is 4 real matches (8 advancers, no BYE cards in main R1).
- When no play-in (full n), R1 renders as the power-of-2 size with BYE cards for the top/excess players.
- Seed 1 at top of its half, seed 2 at bottom of its half (bottom-half reversal at creation).
- Unplayed matches (play-in, BYE, and regular) are clickable in preview for reassignment or in live bracket for swaps. The cascade logic preserves a valid per-round matching.
- Legacy data with round-0 play-ins continues to use the special column + placeholder substitution path. New brackets use the same rendering when a play-in prelim is chosen.
- Future standard-round matches are rendered as non-interactive `TBD` cards before the API creates them. When enabled, the third-place card is rendered in a separate section below the main bracket, without connector lines, and remains non-interactive until the semifinal losers are known.

### Bracket Advancement (`advanceBracketRound`)
- Standard bracket matches with `bracketRound > 0` are considered; play-in matches at `bracketRound: 0` and `isThirdPlace` matches are excluded from winner advancement.
- Winners are collected from the just-completed round **in positional order** (the order they are stored, which matches the visual display order).
- No re-sorting or re-seeding is applied — the initial bracket already encoded all seeding protection at creation time.
- Adjacent pairs of winners advance into the same next-round match: winner[0] vs winner[1], winner[2] vs winner[3], etc.
- The process repeats until only one winner remains. If enabled, the tournament is completed only after the separate `isThirdPlace` match also has a winner.

### Preview / Live Editing Before "Start Bracket"
In the Active Tournament "Bracket" tab (before the bracket stage has started):
- A live-updating preview is shown based on current RR standings + active players.
- The user can click any unplayed R1 card (including bye cards and the play-in card) to reassign participants or change who receives a bye.
- Reassignments use the same pure `cascade*PlayerSwap` functions that power live swaps (guarantees a valid matching: each player appears in at most one match per round).
- Dedicated controls let the host "Add / Force play-in round", "Remove play-in (use bye instead)", or "Auto".
- "Reset to auto-generated" restores the pure seeding result.
- When the host clicks "Start Bracket with Current Preview", the exact match objects from the preview (including any custom byes and the chosen play-in presence) are committed. The `bracketConfig` is also persisted so the choice is remembered.

This gives full configurability without having to recreate the whole tournament.

---

## Bracket Examples

### 4 Players → bracket size 4 (perfect power of 2)
| Round | Match | Players |
|-------|-------|---------|
| R1 (Semifinal) | M1 | Seed 1 vs Seed 4 |
| R1 (Semifinal) | M2 | Seed 3 vs Seed 2 |
| R2 (Final) | M3 | Winner M1 vs Winner M2 |

Seeds 1 and 2 can only meet in the final. ✓

### 6 Players → bracket size 8 (2 byes in R1, no play-in)
Seeding produces 4 R1 matches: two real + two BYE (top seeds receive the byes).

Top seeds get BYE in R1 and advance to the "quarterfinal" round. Lowest seeds play real matches in R1.

### 5 Players (odd, auto play-in) → 1 play-in + main bracket size 4 (clean)
- Play-in (bracketRound 0): Seed 4 vs Seed 5.
- Main bracket created on 4 players (top 3 seeds + PLAY_IN_WINNER placeholder) → power-of-2 size 4.
- Main R1 ("round 1" after the play-in): 2 matches, all real (the 4 advancers play; no padding BYEs in the main bracket's first round).
- The play-in winner is substituted into the correct seeded R1 slot when the play-in game is recorded.

### 9 Players (odd, auto/force play-in) → 1 play-in + main bracket size 8 (4 matches, clean)
- Play-in (bracketRound 0): the two lowest seeds play the qualifier.
- Main bracket created on 8 players (top 7 + PLAY_IN_WINNER) → clean power-of-2 size 8.
- Main R1 (the "4 matches" after the play-in): 4 real matches. All 8 advancers (top seeds + eventual play-in winner) play real matches in this round; there are no extra BYE cards inside the main bracket's first round.
- This is the expected "1 play in round and then 4 matches" for a 9-player bracket.
- When the play-in game completes, the actual winner is substituted into the R1 match that held the placeholder.

### Remove Play-In for Odd Count ('none' on 9 players)
- No preliminary play-in is created.
- Full 9 players are seeded directly → power-of-2 size 16.
- R1 has 8 matches: 7 BYE (top/excess players receive byes in round 1) + 1 real match between the two lowest.
- This is the "use bye instead" / no play-in behavior.

### Force Play-In on Even Count (e.g. 8 players + force)
- Play-in prelim created for the two lowest (even though count is even).
- Main bracket on 7 players (top 6 + PLAY_IN_WINNER) → power-of-2 size 8.
- Main R1: 4 matches, but because the main list has 7 "players", there will be 1 BYE inside the main bracket's first round.
- The force adds the play-in prelim at the cost of introducing a bye in the subsequent main R1.

---

## Implementation Files & Key Logic

| File | Responsibility |
|------|---------------|
| `src/lib/tournament.ts` | `generateBracketSeeding`, `createSeededBracketMatches`, `createBracketMatches` (play-in prelim + reduced main when shouldPlayIn / force, else full n; uses bracketConfig.playInMode), `advanceBracketRound`, cascade re-pairing functions (used for preview swaps and explicit bye forcing), `resyncRoundRobinMatches` (roster-change/refresh match reconciliation for the current RR round) |
| `src/app/api/tournaments/route.ts` | Bracket start (accepts `initialBracketMatches` and `bracketConfig` from preview), round advancement. Does **not** handle player roster edits — see the dedicated endpoint below. |
| `src/app/api/tournaments/[id]/players/route.ts` | Atomic, diff-based add/remove-players endpoint (`PATCH { add?, remove? }`); resyncs RR matches in the same request via `resyncRoundRobinMatches`. |
| `src/app/api/tournaments/[id]/refresh-matches/route.ts` | On-demand "Refresh Matches" endpoint (`POST`, no body); re-runs `resyncRoundRobinMatches` without changing the roster. |
| `src/app/tournaments/active/page.tsx` | Preview state management (`bracketPreviewById`), "Apply play-in mode" regeneration (sets `bracketConfig` on clone and calls creation), swap wrapper that calls cascades locally, "Start Bracket" that commits preview matches + config, roster edit/toggle handlers that call the players/refresh-matches endpoints |
| `src/app/tournaments/active/RoundRobinView.tsx` | Current-round match list + "🔄 Refresh Matches" action |
| `src/app/tournaments/active/BracketView.tsx` | Renders R1 (including play-in real match + bye cards) in a single column for new brackets. Legacy round-0 / `PLAY_IN_WINNER` handling retained for old data. Supports config-mode clicks in preview. |
| `src/app/api/games/route.ts` | Normal game recording. Play-in substitution block: when the play-in match (round 0) is completed, the `PLAY_IN_WINNER` placeholder in the R1 match is replaced with the real winner's ID. |
| `src/types/pingpong.ts` | `BracketConfig { playInMode?, byePlayerIds? }`, added to `Tournament` |
| `src/__tests__/tournament.test.ts` | Tests updated to assert integrated R1 behavior (real play-in in R1 + BYEs for top) |
| `src/__tests__/resyncRoundRobinMatches.test.ts` | Pure-function coverage for the roster-change/refresh match reconciliation rules above, including the simultaneous add+remove duplicate-match regression |
| `src/__tests__/tournamentPlayersRoute.test.ts`, `src/__tests__/tournamentRefreshMatchesRoute.test.ts` | Route-level wiring/guard tests for the two endpoints above |

Legacy round-0 play-ins and `PLAY_IN_WINNER` placeholders continue to be supported for existing tournaments (filters, rendering, and advancement tests still cover them).

---

## Design Notes & Trade-offs

- **Why prelim play-in (round 0) + placeholder instead of integrating the play-in into R1?**  
  The current implementation creates a preliminary `bracketRound: 0` match between the two lowest seeds and a `PLAY_IN_WINNER` placeholder in the R1 slot. This allows the full bracket diagram (including the connector from play-in into the correct R1 slot) to be visible and swappable in preview before the play-in game is played. When the play-in game is recorded, the placeholder is substituted with the real winner. The approach keeps advancement logic simple: `advanceBracketRound` only ever handles `bracketRound > 0` matches.

- **Preview is the primary configuration surface.** Bracket settings (play-in mode, explicit byes) can be experimented with safely before "Start Bracket" commits them. Swaps in preview use the exact same cascade logic that works after start.

- **Backward compatibility.** Old tournaments that still contain `bracketRound: 0` play-ins or `PLAY_IN_WINNER` continue to render and advance correctly.

- **Future extensibility.** `bracketConfig` can be extended (e.g. explicit bye counts per round, different first-round structures) without changing the core seeding/advancement engine.

This document should be treated as the source of truth for the current bracket requirements and behavior.
