# 2v2 Round-Robin Round Design

## Goal

Allow an admin to change one current round-robin round from singles to 2v2 before any game in that round has been recorded. The round's matches become two-player teams versus two-player teams. Each recorded team result contributes equally to each participating player's tournament standings and lifetime statistics.

This is a round-level option, not a tournament-wide format. Earlier and later round-robin rounds, and all bracket rounds, remain singles.

## Scope and Constraints

The first release deliberately supports only an active roster of at least four players whose size is divisible by four when 2v2 is enabled.

- Four active players create one doubles match; eight create two, and so on.
- There are no doubles byes, three-player teams, or incomplete teams.
- The control is disabled with an explanation when the active roster does not meet this requirement.
- The control is disabled permanently for a round after any match in that round has one or more recorded games.
- A round with an automatic singles bye can still be converted if no real games were played; conversion replaces every current-round match, including the bye.
- Roster changes are rejected while a 2v2 current round contains recorded games. Before play, a roster change is allowed only if the resulting active roster is still divisible by four; otherwise the API rejects it and the admin must first return the round to singles or adjust the roster.

The divisibility rule is intentional. Treating one to three players as a bye, partial team, or idle player changes standings and resync semantics. Those alternatives should be designed as a separate feature rather than hidden in the first implementation.

## User Experience

The active tournament context menu gets a `Round format` action while the tournament is in the round-robin stage.

1. The action describes the current round, for example, `Enable 2v2 for Round 2`.
2. It is enabled only for admins, before the bracket starts, when no current-round game has been recorded, and when the active roster satisfies the doubles constraint.
3. Selecting it shows a confirmation that existing unplayed matches for that round will be replaced and that each player receives the team's results.
4. On confirmation, the client sends one round-format request; it does not edit matches locally.
5. The server atomically deletes the unplayed current-round matches, creates the doubles matches, updates the match index, and saves the tournament.
6. The round-robin view labels the round `2v2`, and each match card renders `Player A + Player B` on each side.

Before the first game, provide `Use 1v1 instead` in the same location. It performs the inverse atomic regeneration. This is low-cost and prevents an accidental format selection from requiring match-by-match repair. It disappears once any game is recorded.

## Data Model

The existing `Match.player1Id` / `player2Id` and `Game.player1Id` / `player2Id` fields represent exactly two individual participants. Do not overload either field with synthetic team IDs or a comma-separated player list. That would break historical game queries and make player statistics unreliable.

Introduce explicit sides while retaining the existing fields for existing singles data:

```ts
type RoundRobinFormat = 'singles' | 'doubles';

interface Tournament {
  // Existing fields...
  roundRobinFormats?: Record<number, RoundRobinFormat>;
}

interface Match {
  // Existing legacy singles fields remain for backwards compatibility.
  side1PlayerIds?: string[];
  side2PlayerIds?: string[];
}

interface Game {
  // Snapshot of the participants when this game was recorded.
  side1PlayerIds?: string[];
  side2PlayerIds?: string[];
}
```

Rules:

- Missing `roundRobinFormats[round]` means singles.
- Missing side arrays means legacy singles and uses `player1Id` and `player2Id`.
- A newly generated singles match should continue writing the existing two player fields. Writing side arrays for all singles matches is optional and should not be required for the first release.
- A doubles match writes two IDs in each side array. It also writes the first player of each side to the required legacy `player1Id` and `player2Id` fields solely as deterministic compatibility references. Format-aware code must not use those fields to identify a doubles side.
- A doubles game copies its match's side arrays. This is a historical snapshot: later roster or match edits cannot alter the meaning of persisted statistics.
- A doubles game likewise preserves the first player from each side in the required legacy fields. This keeps existing MongoDB documents, types, and non-format-aware reads valid without making the legacy fields nullable.
- `winnerId` is insufficient for doubles because a winning side has two players. Add `winnerSide?: 1 | 2` for doubles and retain `winnerId` for singles and byes.

The resulting helper boundary should be explicit:

```ts
function getMatchSides(match: Match): [string[], string[]]
function getGameSides(game: Game): [string[], string[]]
function getWinningSide(match: Match): 1 | 2 | undefined
```

All new format-aware code should use these helpers. Legacy-specific code can continue using individual fields until it is converted. This limits compatibility risk and permits old MongoDB and Redis documents to remain valid without a migration.

## Generation and Resync

Add a format parameter to `createRoundRobinPairings` or introduce a small format-aware wrapper around it. Singles generation keeps its current behavior.

For a doubles round:

1. Obtain the normal active-player ordering for the configured round-robin strategy.
2. Partition it into ordered groups of four.
3. Create each match as side 1: positions 1 and 4, side 2: positions 2 and 3.

For `top-vs-top` and `swiss`, the 1-and-4 versus 2-and-3 arrangement balances the four-player group rather than making the strongest two players partners. For `random`, the input order is already shuffled, so this remains random.

The pairing strategy continues to determine player order only. The first release does not try to optimize partner rotation or avoid prior doubles opponents. Adding either requires a doubles-specific optimization objective and is out of scope for one converted round.

`resyncRoundRobinMatches`, `advanceRoundRobinRound`, and the player roster endpoint must accept the round's format instead of assuming two slots per match. In doubles mode:

- A locked match is any current-round match with a recorded game or a determined winner side.
- The four players in a locked match are excluded from the pairing pool.
- All unlocked current-round doubles matches are regenerated as a whole.
- Validation requires every generated match to have exactly two distinct players per side and four distinct players total.
- Future rounds default to singles unless explicitly enabled for that new current round.

The current singles player-swap cascade should not be extended mechanically. Doubles needs a separate `cascadeRoundRobinTeamSwap` operation or a dedicated edit UI that changes all four slots and validates uniqueness across the round. The initial release should omit manual team editing from the match card; the admin can switch back to singles before play, adjust the roster, and enable doubles again.

## Scoring and Match Completion

Score validation remains unchanged because a ping-pong game still has two scores.

When recording a doubles game, the API must derive its participant arrays from the stored match, not trust participant IDs supplied by the browser. The client submits only `matchId`, `score1`, and `score2` for all match formats.

`recalculateMatchWinner` counts score wins by side as it does today. It sets:

- `winnerId` for singles.
- `winnerSide` for doubles.

Every completion check currently based on `match.winnerId` must instead use `getWinningSide(match)` or an `isMatchComplete(match)` helper. This includes current-round advancement, round dots, the round-robin view CTA, and bracket-start eligibility.

2v2 matches are round-robin-only. The bracket remains individual singles. Its seeding consumes individual standings, described below.

## Standings, Bracket Seeding, and Statistics

For every completed doubles match:

- Each player on the winning side receives one match win.
- Each player on the losing side receives one match loss.
- Each player on side 1 receives each game's `score1 - score2` point differential.
- Each player on side 2 receives each game's `score2 - score1` point differential.

Consequently, existing singles and doubles outcomes can be combined in one individual leaderboard and can seed the existing singles bracket without creating team entities.

Extract the duplicated standings calculations from `Leaderboard`, `rankPlayersByStandings`, and `createBracketMatches` into one format-aware helper. It should return per-player match wins, losses, games played, and point differential. This prevents a doubles result from being counted differently in the displayed standings and bracket seeding.

The global stats API currently receives only `Game` documents and assumes `player1Id` and `player2Id`. Update `computeStats` to use `getGameSides`:

- Increment games played, total points, and game win/loss for every player on the appropriate side.
- Apply a game result to both members of a doubles team equally.
- Continue interpreting old games through their individual fields.

The stats page's `totalGames` remains the number of physical games, not four player-game participations.

## API and Authorization

Add an authenticated admin-only tournament action, for example:

```json
{
  "id": "tournament-id",
  "action": "setRoundRobinFormat",
  "round": 2,
  "format": "doubles"
}
```

The server is authoritative and must validate all of the following:

- Tournament exists, is active, and has not started a bracket.
- Requested round is the current round only.
- Format is `singles` or `doubles`.
- No match in that round has recorded games. Check games, not just `winnerId`, so automatic legacy byes do not incorrectly lock conversion.
- For doubles, the active roster has at least four players and its size is divisible by four.
- All current-round matches being replaced are unplayed.

On success it updates `roundRobinFormats`, replaces current-round matches, unregisters removed match IDs, registers new IDs, and persists the tournament in one server-side operation. It returns the complete updated tournament.

Also update the games and match APIs to reject client attempts to alter doubles participant arrays or directly set a doubles winner. The server must derive both from stored match state and scores.

## UI Changes

- `RoundRobinView`: show the selected round's format and only expose the format action for the live round.
- `MatchCard`: render teams as two names joined by ` + `, highlight all winning-side players, label score inputs by team, and remove singles player swap and marker actions for doubles.
- Post-bracket round-robin history: render both players on each team, rather than `player1Id` versus `player2Id`.
- Active roster controls: explain and prevent an invalid roster change while a doubles round is selected.
- Tournament creation: no changes. 2v2 is intentionally enabled only from the active tournament context for an individual round.

## Implementation Order

1. Add format-aware types, side helpers, winner/completion helpers, and unit tests that prove legacy singles behavior is unchanged.
2. Make standings, bracket seeding, pairing ranking, and global stats consume the helpers.
3. Implement doubles match generation and format-aware round resync, including roster validation.
4. Add the server action and match-index updates with integration tests.
5. Update game recording so doubles participant snapshots are written and completion works.
6. Update the active-round and history UI, then add the context-menu control and confirmation.
7. Run the full suite and manually verify a four- and an eight-player converted round, conversion reversal before play, failed invalid-roster conversion, editing/deleting a doubles game, subsequent singles round generation, and bracket seeding.

## Test Matrix

- Existing singles match, game, stats, standings, resync, and bracket tests remain green without fixture changes.
- A four-player doubles round produces one match with two distinct players per side.
- An eight-player doubles round produces two matches and each active player appears exactly once.
- Enabling doubles replaces all unplayed current-round matches and updates the match index.
- Enabling doubles fails for fewer than four or non-multiple-of-four active players.
- Enabling or disabling doubles fails after any game in the round is recorded.
- A doubles game credits points and win/loss to all four participating players in global stats and tournament standings.
- Best-of-three doubles completion sets a winning side only after two game wins.
- An edited or deleted doubles game recalculates completion and all derived standings correctly.
- A later singles round and bracket seed players using combined individual results.
- Roster updates reject an invalid active count while doubles is configured and preserve both tournament and match index state.

## Deferred Decisions

The following should remain out of the first release until product behavior is defined:

- What to do with one to three extra active players in a doubles round.
- Manual edits to a doubles team's four participants.
- Tracking recurring partners, opponent history, or team-level records.
- Doubles bracket rounds or persistent named teams.
