# Bracket Tournament Requirements

## Overview

Tournaments run in two phases: **Round Robin** followed by a **Single-Elimination Bracket**. The bracket seeds players by their round-robin performance. 

The play-in is configurable via preview controls and `bracketConfig.playInMode`:
- When a play-in is present (auto for odd counts, or forced), a preliminary play-in match (bracketRound 0) is created between the two lowest seeds. The main bracket is then generated on the reduced set of (activeCount-1) players (top seeds + a `PLAY_IN_WINNER` placeholder slot). This produces a clean power-of-2 main bracket whose first round ("round 1" after the play-in) has no extra BYEs for the advancers.
- For 9 players + play-in: 1 play-in round + 4 matches in the main bracket R1 (8-player power-of-2 bracket; the 7 top seeds + play-in winner all play real matches in the round of 8).
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
- **Removing a player**: unplayed matches in the current round involving that player are deleted. Completed matches are preserved for stats.
- **Adding 1 player**: if a bye match exists in the current round, it is converted into a real match against the new player. Otherwise the player is included from the next round onward.
- **Adding 2+ players at once**: new players are paired against each other first (two at a time) and new matches are created for the current round. Any single leftover follows the single-player rule above.

### Advancement
- The host manually advances rounds after all current-round matches are complete.
- After the final configured round, the tournament transitions to the bracket phase (via the "Start Bracket" action in the UI).

---

## Phase 2 — Single-Elimination Bracket

### Seeding
- Players are ranked by round-robin wins (descending). Ties are broken by point differential, then randomly.
- Only active players enter the bracket.
- The ranking is stored on the tournament as `playerRanking` (best first).

### Bracket Generation
- We always generate for the **full** count of active players `n` (no early reduction).
- `n` is rounded up to the next power of 2 for R1 slot count.
- `generateBracketSeeding(n)` (recursive interleave) produces standard protection:
  - Example for `n = 8`: `[1,8, 4,5, 2,7, 3,6]`
  - Guarantees seeds 1 and 2 meet only in the final, 1-4 only in semis, etc.
- After generating matches for the power-of-2 slots, the bottom half is reversed so seed 1 appears at the top of the visual bracket and seed 2 at the bottom.
- `createSeededBracketMatches` (and the caller `createBracketMatches`) implement this.

### Configurability — Play-In Round and Byes (`bracketConfig`)
A `bracketConfig` object (stored on the `Tournament`) controls play-in behavior:

- `playInMode`: `'auto' | 'force' | 'none'`
  - `'auto'` (default): for odd active count, create a preliminary play-in match (bracketRound 0) between the two lowest seeds. Then create the main bracket on the reduced (activeCount-1) players (top seeds + `PLAY_IN_WINNER` placeholder). For 9 players this yields 1 play-in + 4 clean matches in the main bracket's first round (8-player power-of-2; all 8 advancers play real matches, no extra BYEs in main R1).
  - `'force'`: same as auto but force the preliminary play-in even on an even count. The main bracket is reduced to (n-1) slots (may introduce BYEs inside the main R1 if n-1 is not itself a power of 2).
  - `'none'`: for odd count, do *not* create a play-in. Seed the full n → power-of-2 R1 will contain BYEs for the top/excess players in round 1 (the "remove play-in / use bye instead" behavior).

- `byePlayerIds` (optional): explicit list of players who must receive a R1 bye. After initial seeding, a cascade re-pairing (same logic used in live swaps) moves the desired players into bye slots and displaces others. This works in preview and is respected on "Start Bracket".

**Rationale for prelim play-in + reduced main (when play-in present):**
- For odd counts (or forced), the user expects "1 play-in round and then 4 matches" (for 9 players): a preliminary qualifier + a clean power-of-2 main bracket whose first round has the advancers (including the play-in winner) all playing real matches, without padding BYEs inside the main R1.
- Top seeds play their first match in the main bracket's R1 (round of 8 for 9 players) rather than getting a "bye from round of 16".
- The `PLAY_IN_WINNER` placeholder + lazy substitution on play-in completion allows the full bracket diagram (including the feeding from play-in into the correct R1 slot) to be visible and editable in preview even before the play-in game is played.
- "Remove play-in" (none on odd) produces the larger R1 with BYEs for the top players, which is the configurable alternative.
- Preview controls (`+ Add / Force play-in round`, `− Remove play-in (use bye instead)`, `Auto`) + click-to-reassign (including on the play-in card and bye cards) and "Start Bracket with Current Preview" give safe experimentation before commit.
- Legacy round-0 play-ins continue to work.

### Bye Handling (non-power-of-2 player counts)
- R1 size = next power of 2.
- Excess slots become **BYE** (auto-won, no games).
- Top seeds (lowest indices in `playerRanking`) are placed in the positions that receive BYE.
- Explicit `byePlayerIds` (from preview) can override which players receive the BYEs (post-seeding cascade re-pairing).
- Bye matches carry `winnerId` immediately and are eligible for player swaps (both before and after "Start Bracket").

### Play-In Match (Odd Count or Forced) — Preliminary + Reduced Main
- When `shouldPlayIn` (auto for odd, or force): create a preliminary play-in match as **bracketRound 0** between the two lowest seeds.
- Then (if creating main bracket) generate the main bracket R1 on the reduced list of (activeCount-1) players: the top (n-2) seeds + a `PLAY_IN_WINNER` placeholder.
- The main R1 is therefore a clean power-of-2 bracket (for 9 players: 8 slots → 4 matches, no padding BYEs in main R1). All advancers (top seeds + the eventual play-in winner) play real matches in the main bracket's first round.
- The placeholder is later substituted with the real winner when the play-in game is recorded (see games route substitution logic). This allows the diagram and preview to show the feeding from play-in into the correct R1 slot even before the play-in is played.
- When `playInMode = 'none'` on odd: no preliminary; full n seeding is used (BYEs appear in R1 for the top/excess players).
- For force on even count: still create the prelim play-in + main on (n-1) slots (the resulting main R1 may contain BYEs if n-1 is not a power of 2).

### Visual Layout (BracketView)
- When a play-in (round 0) is present, it renders in a dedicated left "Play-in" column, with a connector line feeding into the specific R1 match slot that contains the `PLAY_IN_WINNER` placeholder (or the real name after substitution).
- The main bracket R1 (the reduced power-of-2 matches) renders in the next column(s). For 9 players + play-in this is 4 real matches (8 advancers, no BYE cards in main R1).
- When no play-in (full n), R1 renders as the power-of-2 size with BYE cards for the top/excess players.
- Seed 1 at top of its half, seed 2 at bottom of its half (bottom-half reversal at creation).
- Unplayed matches (play-in, BYE, and regular) are clickable in preview for reassignment or in live bracket for swaps. The cascade logic preserves a valid per-round matching.
- Legacy data with round-0 play-ins continues to use the special column + placeholder substitution path. New brackets use the same rendering when a play-in prelim is chosen.

### Bracket Advancement (`advanceBracketRound`)
- All bracket matches with `bracketRound > 0` are considered (play-in matches at `bracketRound: 0` are excluded).
- Winners are collected from the just-completed round **in positional order** (the order they are stored, which matches the visual display order).
- No re-sorting or re-seeding is applied — the initial bracket already encoded all seeding protection at creation time.
- Adjacent pairs of winners advance into the same next-round match: winner[0] vs winner[1], winner[2] vs winner[3], etc.
- The process repeats until only one winner remains (tournament completed).

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
| `src/lib/tournament.ts` | `generateBracketSeeding`, `createSeededBracketMatches`, `createBracketMatches` (play-in prelim + reduced main when shouldPlayIn / force, else full n; uses bracketConfig.playInMode), `advanceBracketRound`, cascade re-pairing functions (used for preview swaps and explicit bye forcing) |
| `src/app/api/tournaments/route.ts` | Bracket start (accepts `initialBracketMatches` and `bracketConfig` from preview), round advancement |
| `src/app/tournaments/active/page.tsx` | Preview state management (`bracketPreviewById`), "Apply play-in mode" regeneration (sets `bracketConfig` on clone and calls creation), swap wrapper that calls cascades locally, "Start Bracket" that commits preview matches + config |
| `src/app/tournaments/active/BracketView.tsx` | Renders R1 (including play-in real match + bye cards) in a single column for new brackets. Legacy round-0 / `PLAY_IN_WINNER` handling retained for old data. Supports config-mode clicks in preview. |
| `src/app/api/games/route.ts` | Normal game recording. Play-in substitution block: when the play-in match (round 0) is completed, the `PLAY_IN_WINNER` placeholder in the R1 match is replaced with the real winner's ID. |
| `src/types/pingpong.ts` | `BracketConfig { playInMode?, byePlayerIds? }`, added to `Tournament` |
| `src/__tests__/tournament.test.ts` | Tests updated to assert integrated R1 behavior (real play-in in R1 + BYEs for top) |

Legacy round-0 play-ins and `PLAY_IN_WINNER` placeholders continue to be supported for existing tournaments (filters, rendering, and advancement tests still cover them).

---

## Design Notes & Trade-offs

- **Why prelim play-in (round 0) + placeholder instead of integrating the play-in into R1?**  
  The current implementation creates a preliminary `bracketRound: 0` match between the two lowest seeds and a `PLAY_IN_WINNER` placeholder in the R1 slot. This allows the full bracket diagram (including the connector from play-in into the correct R1 slot) to be visible and swappable in preview before the play-in game is played. When the play-in game is recorded, the placeholder is substituted with the real winner. The approach keeps advancement logic simple: `advanceBracketRound` only ever handles `bracketRound > 0` matches.

- **Preview is the primary configuration surface.** Bracket settings (play-in mode, explicit byes) can be experimented with safely before "Start Bracket" commits them. Swaps in preview use the exact same cascade logic that works after start.

- **Backward compatibility.** Old tournaments that still contain `bracketRound: 0` play-ins or `PLAY_IN_WINNER` continue to render and advance correctly.

- **Future extensibility.** `bracketConfig` can be extended (e.g. explicit bye counts per round, different first-round structures) without changing the core seeding/advancement engine.

This document should be treated as the source of truth for the current bracket requirements and behavior.
