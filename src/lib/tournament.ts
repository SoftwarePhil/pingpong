import { Tournament, Match } from '../types/pingpong';

/** Placeholder player slot used when a downstream bracket match's participant
 * is invalidated by an upstream correction and no replacement winner is yet
 * determined (i.e. the upstream match was edited back into an incomplete state). */
export const TBD_PLACEHOLDER = 'TBD';

/** Placeholder used for a play-in winner before its preliminary match is played. */
export const PLAY_IN_WINNER_PLACEHOLDER = 'PLAY_IN_WINNER';

/** Returns true for the legacy single play-in placeholder and indexed placeholders. */
export function isPlayInWinnerPlaceholder(playerId: string): boolean {
  return playerId === PLAY_IN_WINNER_PLACEHOLDER || /^PLAY_IN_WINNER_\d+$/.test(playerId);
}

/** Keeps the original placeholder name for one play-in for legacy data. */
export function getPlayInWinnerPlaceholder(index: number, total: number): string {
  return total === 1
    ? PLAY_IN_WINNER_PLACEHOLDER
    : `${PLAY_IN_WINNER_PLACEHOLDER}_${index + 1}`;
}

/** Replaces the R1 slot fed by a preliminary match with its winner. */
export function replacePlayInWinnerSlot(
  matches: Match[],
  playInMatchId: string,
  winnerId?: string,
): Match[] {
  const playInMatches = matches.filter(m =>
    m.round === 'bracket' && (m.bracketRound ?? 0) === 0
  );
  const playInIndex = playInMatches.findIndex(m => m.id === playInMatchId);
  const playInMatch = playInMatches[playInIndex];
  if (!playInMatch) return matches;

  const placeholder = getPlayInWinnerPlaceholder(playInIndex, playInMatches.length);
  const participantIds = [playInMatch.player1Id, playInMatch.player2Id];
  const target = matches.find(m =>
    m.round === 'bracket' &&
    (m.bracketRound ?? 0) === 1 &&
    [m.player1Id, m.player2Id].some(id =>
      id === placeholder || participantIds.includes(id)
    )
  );
  if (!target) return matches;

  const isPlayer1Slot = target.player1Id === placeholder || participantIds.includes(target.player1Id);
  const replacement = winnerId ?? TBD_PLACEHOLDER;
  return matches.map(m => m.id === target.id
    ? {
        ...m,
        ...(isPlayer1Slot ? { player1Id: replacement } : { player2Id: replacement }),
        winnerId: undefined,
      }
    : m
  );
}

/** Returns the configured bestOf for a bracket round with the given match count.
 * Falls back to 1 if no config entry matches. */
function getBestOfForMatchCount(tournament: Tournament, matchCount: number): number {
  const config = tournament.bracketRounds.find(b => b.matchCount === matchCount);
  return config?.bestOf ?? 1;
}

/**
 * Propagates a bracket match's (re)computed outcome forward into the bracket.
 *
 * When a completed bracket match is corrected after the fact (a game's score
 * edited, added, or deleted, changing or clearing its winner), any later
 * round match that was already seeded with the *old* winner is now stale.
 * This walks forward from the given match, round by round, and:
 *   - Updates the downstream match's player slot to the corrected winner
 *     (or a TBD placeholder if the match no longer has a determined winner).
 *   - If that downstream match already had games recorded or a winner of its
 *     own, those are no longer valid (they were played against the wrong
 *     participant) and are cleared, with the cascade continuing further
 *     downstream from there.
 *   - Stops as soon as a downstream slot already matches the expected value,
 *     or once there is no further round to reconcile.
 *
 * Play-in matches (bracketRound 0) are intentionally excluded — their
 * winner is threaded into R1 via a dedicated one-time placeholder swap
 * elsewhere, not via this positional cascade.
 *
 * Returns a new matches array (does not mutate) plus the IDs of any games
 * that were invalidated, so callers can also purge them from long-term
 * history stores.
 */
export function cascadeBracketOutcomeChange(
  matches: Match[],
  matchId: string,
): { matches: Match[]; invalidatedGameIds: string[] } {
  let result = matches;
  const invalidatedGameIds: string[] = [];
  let currentId = matchId;

  while (true) {
    const match = result.find(m => m.id === currentId);
    if (!match || match.round !== 'bracket') break;
    const roundNum = match.bracketRound ?? 0;
    if (roundNum <= 0) break; // Play-in propagation is handled separately

    const roundMatches = result.filter(m =>
      m.round === 'bracket' &&
      !m.isThirdPlace &&
      (m.bracketRound ?? 0) === roundNum
    );
    const posInRound = roundMatches.findIndex(m => m.id === match.id);
    if (posInRound === -1) break;

    const nextRoundMatches = result.filter(m =>
      m.round === 'bracket' &&
      !m.isThirdPlace &&
      (m.bracketRound ?? 0) === roundNum + 1
    );
    const nextMatch = nextRoundMatches[Math.floor(posInRound / 2)];
    if (!nextMatch) break; // Next round hasn't been created yet — nothing to reconcile

    const isTopSlot = posInRound % 2 === 0;
    const expectedSlot = match.winnerId ?? TBD_PLACEHOLDER;
    const currentSlot = isTopSlot ? nextMatch.player1Id : nextMatch.player2Id;

    // A third-place match receives the losers from the two semifinal matches,
    // so reconcile its corresponding slot alongside the final's winner slot.
    const thirdPlaceMatch = result.find(m =>
      m.round === 'bracket' &&
      m.isThirdPlace &&
      (m.bracketRound ?? 0) === roundNum + 1
    );
    const expectedThirdPlaceSlot = match.winnerId
      ? (match.winnerId === match.player1Id ? match.player2Id : match.player1Id)
      : TBD_PLACEHOLDER;
    const currentThirdPlaceSlot = thirdPlaceMatch
      ? (isTopSlot ? thirdPlaceMatch.player1Id : thirdPlaceMatch.player2Id)
      : expectedThirdPlaceSlot;
    const nextSlotChanged = currentSlot !== expectedSlot;
    const thirdPlaceSlotChanged = currentThirdPlaceSlot !== expectedThirdPlaceSlot;

    if (!nextSlotChanged && !thirdPlaceSlotChanged) {
      break; // Already consistent — nothing to propagate
    }

    if (nextSlotChanged) {
      let updatedNext: Match = {
        ...nextMatch,
        ...(isTopSlot ? { player1Id: expectedSlot } : { player2Id: expectedSlot }),
      };

      // Games already recorded against the stale participant are no longer valid.
      if (updatedNext.games.length > 0 || updatedNext.winnerId) {
        invalidatedGameIds.push(...updatedNext.games.map(g => g.id));
        updatedNext = { ...updatedNext, games: [], winnerId: undefined };
      }

      result = result.map(m => (m.id === nextMatch.id ? updatedNext : m));
    }

    if (thirdPlaceMatch && thirdPlaceSlotChanged) {
      let updatedThirdPlace: Match = {
        ...thirdPlaceMatch,
        ...(isTopSlot
          ? { player1Id: expectedThirdPlaceSlot }
          : { player2Id: expectedThirdPlaceSlot }),
      };

      if (updatedThirdPlace.games.length > 0 || updatedThirdPlace.winnerId) {
        invalidatedGameIds.push(...updatedThirdPlace.games.map(g => g.id));
        updatedThirdPlace = { ...updatedThirdPlace, games: [], winnerId: undefined };
      }

      result = result.map(m => (m.id === thirdPlaceMatch.id ? updatedThirdPlace : m));
    }

    currentId = nextMatch.id;
  }

  return { matches: result, invalidatedGameIds };
}

/**
 * Applies a player swap to a round-robin match and cascades the displaced
 * player(s) into any other unplayed match in the same round, so each player
 * appears at most once per round.
 *
 * Returns a new array of matches with all changes applied (does not mutate).
 * Throws if the target match is not a round-robin match, has already been
 * played, or the two new players are the same.
 */
export function cascadeRoundRobinPlayerSwap(
  matches: Match[],
  matchId: string,
  newPlayer1Id: string,
  newPlayer2Id: string,
): Match[] {
  const target = matches.find(m => m.id === matchId);
  if (!target) throw new Error(`Match ${matchId} not found`);
  if (target.round !== 'roundRobin') throw new Error('Players can only be changed in round robin matches');
  if (target.games.length > 0) throw new Error('Cannot change players after games have been played');
  if (newPlayer1Id === newPlayer2Id) throw new Error('Player 1 and Player 2 must be different');

  const oldPlayers = [target.player1Id, target.player2Id];
  const newPlayers = [newPlayer1Id, newPlayer2Id];
  const displaced = oldPlayers.filter(p => !newPlayers.includes(p));
  const incoming  = newPlayers.filter(p => !oldPlayers.includes(p));

  // Map: incoming player → the displaced player that should take their old slot
  const swapMap = new Map<string, string>();
  incoming.forEach((p, i) => swapMap.set(p, displaced[i]));

  return matches.map(m => {
    if (m.id === matchId) {
      return { ...m, player1Id: newPlayer1Id, player2Id: newPlayer2Id };
    }
    // Only cascade to other unplayed round-robin matches in the same round
    if (
      m.round !== 'roundRobin' ||
      m.bracketRound !== target.bracketRound ||
      m.games.length > 0 ||
      m.winnerId
    ) {
      return m;
    }
    let p1 = m.player1Id;
    let p2 = m.player2Id;
    if (swapMap.has(p1)) p1 = swapMap.get(p1)!;
    if (swapMap.has(p2)) p2 = swapMap.get(p2)!;
    if (p1 === m.player1Id && p2 === m.player2Id) return m;
    return { ...m, player1Id: p1, player2Id: p2 };
  });
}

/**
 * Returns true for a match that has been definitively won by a real player
 * (i.e. at least one game was played), **or** has a winnerId set while not
 * being a bye-match placeholder.  Bye matches (player2Id === 'BYE') carry a
 * winnerId automatically but contain no real games and must still be eligible
 * for player-swap cascades.
 */
function isNonByeCompletedMatch(m: Match): boolean {
  return m.games.length > 0 || (!!m.winnerId && m.player1Id !== 'BYE' && m.player2Id !== 'BYE');
}

/**
 * Applies a player swap to a bracket round-1 match and cascades the displaced
 * player(s) into any other unplayed bracket round-1 match, so each player
 * appears at most once.
 *
 * Returns a new array of matches with all changes applied (does not mutate).
 * Throws if the target match is not a bracket round-1 match, has already been
 * played, or the two new players are the same.
 */
export function cascadeBracketR1PlayerSwap(
  matches: Match[],
  matchId: string,
  newPlayer1Id: string,
  newPlayer2Id: string,
): Match[] {
  const target = matches.find(m => m.id === matchId);
  if (!target) throw new Error(`Match ${matchId} not found`);
  if (target.round !== 'bracket' || target.bracketRound !== 1)
    throw new Error('Players can only be changed in bracket round 1 matches');
  if (target.games.length > 0) throw new Error('Cannot change players after games have been played');
  if (newPlayer1Id === newPlayer2Id) throw new Error('Player 1 and Player 2 must be different');

  const oldPlayers = [target.player1Id, target.player2Id].filter(p => p !== 'BYE' && !isPlayInWinnerPlaceholder(p));
  const newPlayers = [newPlayer1Id, newPlayer2Id].filter(p => p !== 'BYE' && !isPlayInWinnerPlaceholder(p));
  const displaced = oldPlayers.filter(p => !newPlayers.includes(p));
  const incoming  = newPlayers.filter(p => !oldPlayers.includes(p));

  // Map: incoming player → the displaced player that should take their old slot
  const swapMap = new Map<string, string>();
  incoming.forEach((p, i) => { if (displaced[i]) swapMap.set(p, displaced[i]); });

  return matches.map(m => {
    if (m.id === matchId) {
      const updated = { ...m, player1Id: newPlayer1Id, player2Id: newPlayer2Id };
      // Update the automatic bye winner when swapping in/out of a bye slot
      if (newPlayer1Id === 'BYE' || newPlayer2Id === 'BYE') {
        updated.winnerId = newPlayer1Id === 'BYE' ? newPlayer2Id : newPlayer1Id;
      }
      return updated;
    }
    // Only cascade to other unplayed bracket round-1 matches.
    // Bye matches (player2Id === 'BYE') have winnerId set automatically but no games
    // played — they must still be cascaded so player positions stay consistent.
    if (
      m.round !== 'bracket' ||
      m.bracketRound !== 1 ||
      isNonByeCompletedMatch(m)
    ) {
      return m;
    }
    let p1 = m.player1Id;
    let p2 = m.player2Id;
    if (swapMap.has(p1)) p1 = swapMap.get(p1)!;
    if (swapMap.has(p2)) p2 = swapMap.get(p2)!;
    if (p1 === m.player1Id && p2 === m.player2Id) return m;
    const updated = { ...m, player1Id: p1, player2Id: p2 };
    // Keep the automatic bye winner in sync
    if (p1 === 'BYE' || p2 === 'BYE') {
      updated.winnerId = p1 === 'BYE' ? p2 : p1;
    }
    return updated;
  });
}

/**
 * Applies a player swap to any unplayed bracket match and cascades the displaced
 * player(s) into any other unplayed bracket match in the same round, so each
 * player appears at most once per round.
 *
 * Works for any bracket round (R1, R2, etc.).
 * Returns a new array of matches with all changes applied (does not mutate).
 * Throws if the target match is not a bracket match, has already been played,
 * or the two new players are the same.
 */
export function cascadeBracketPlayerSwap(
  matches: Match[],
  matchId: string,
  newPlayer1Id: string,
  newPlayer2Id: string,
): Match[] {
  const target = matches.find(m => m.id === matchId);
  if (!target) throw new Error(`Match ${matchId} not found`);
  if (target.round !== 'bracket')
    throw new Error('Players can only be changed in bracket matches');
  if (target.games.length > 0) throw new Error('Cannot change players after games have been played');
  if (newPlayer1Id === newPlayer2Id) throw new Error('Player 1 and Player 2 must be different');

  // Once semifinal losers have been assigned, the final and placement match
  // are linked outcomes and must not exchange participants.
  if (
    target.isThirdPlace ||
    matches.some(m =>
      m.round === 'bracket' &&
      m.isThirdPlace &&
      m.bracketRound === target.bracketRound
    )
  ) {
    throw new Error('Final and third-place participants are fixed after the semifinals');
  }

  const oldPlayers = [target.player1Id, target.player2Id].filter(p => p !== 'BYE' && !isPlayInWinnerPlaceholder(p));
  const newPlayers = [newPlayer1Id, newPlayer2Id].filter(p => p !== 'BYE' && !isPlayInWinnerPlaceholder(p));
  const displaced = oldPlayers.filter(p => !newPlayers.includes(p));
  const incoming  = newPlayers.filter(p => !oldPlayers.includes(p));

  // Map: incoming player → the displaced player that should take their old slot
  const swapMap = new Map<string, string>();
  incoming.forEach((p, i) => { if (displaced[i]) swapMap.set(p, displaced[i]); });

  return matches.map(m => {
    if (m.id === matchId) {
      const updated = { ...m, player1Id: newPlayer1Id, player2Id: newPlayer2Id };
      // Update the automatic bye winner when swapping in/out of a bye slot
      if (newPlayer1Id === 'BYE' || newPlayer2Id === 'BYE') {
        updated.winnerId = newPlayer1Id === 'BYE' ? newPlayer2Id : newPlayer1Id;
      }
      return updated;
    }
    // Only cascade to other unplayed bracket matches in the same round.
    // Bye matches (player2Id === 'BYE') have winnerId set automatically but no
    // real games — they must still be cascaded so player positions stay consistent.
    if (
      m.round !== 'bracket' ||
      m.bracketRound !== target.bracketRound ||
      isNonByeCompletedMatch(m)
    ) {
      return m;
    }
    let p1 = m.player1Id;
    let p2 = m.player2Id;
    if (swapMap.has(p1)) p1 = swapMap.get(p1)!;
    if (swapMap.has(p2)) p2 = swapMap.get(p2)!;
    if (p1 === m.player1Id && p2 === m.player2Id) return m;
    const updated = { ...m, player1Id: p1, player2Id: p2 };
    // Keep the automatic bye winner in sync
    if (p1 === 'BYE' || p2 === 'BYE') {
      updated.winnerId = p1 === 'BYE' ? p2 : p1;
    }
    return updated;
  });
}

// Helper function to create a single round of round robin pairings
export function createRoundRobinPairings(players: string[], tournamentId: string, bracketRound: number = 1, bestOf: number = 1): Match[] {
  const newMatches: Match[] = [];
  const shuffled = [...players];

  // If odd number of players, the last one gets a bye
  let byePlayer: string | null = null;
  if (shuffled.length % 2 === 1) {
    byePlayer = shuffled.pop()!;
  }

  // Pair the remaining players
  for (let i = 0; i < shuffled.length; i += 2) {
    const newMatch: Match = {
      id: Date.now().toString() + Math.random(),
      tournamentId,
      createdAt: new Date().toISOString(),
      player1Id: shuffled[i],
      player2Id: shuffled[i + 1],
      round: 'roundRobin',
      bracketRound: bracketRound,
      bestOf: bestOf,
      games: [],
    };
    newMatches.push(newMatch);
  }

  // Create bye match if any
  if (byePlayer) {
    const byeMatch: Match = {
      id: Date.now().toString() + Math.random(),
      tournamentId,
      createdAt: new Date().toISOString(),
      player1Id: byePlayer,
      player2Id: 'BYE',
      round: 'roundRobin',
      bracketRound: bracketRound,
      bestOf: bestOf,
      games: [],
      winnerId: byePlayer, // Automatic win
    };
    newMatches.push(byeMatch);
  }

  return newMatches;
}

// Function to advance bracket round
export function advanceBracketRound(tournament: Tournament): Match[] {
  const newMatches: Match[] = [];

  // Exclude play-in matches (bracketRound === 0) — they are handled separately
  // when their game is recorded. Including them here would treat the play-in winner
  // as an extra Round 1 winner, causing a phantom bye in Round 2.
  const bracketMatches = (tournament.matches ?? []).filter(
    m => m.round === 'bracket' && !m.isThirdPlace && (m.bracketRound ?? 0) > 0
  );
  if (bracketMatches.length === 0) {
    return []; // No bracket matches exist
  }

  const currentRound = Math.max(...bracketMatches.map(m => m.bracketRound ?? 1));
  const currentRoundMatches = bracketMatches.filter(m => (m.bracketRound ?? 1) === currentRound);

  // Check if all current round matches are completed
  const incompleteMatches = currentRoundMatches.filter(m => !m.winnerId);
  if (incompleteMatches.length > 0) {
    return []; // Current round not complete
  }

  // Get winners in positional order (preserves the bracket structure encoded at R1 creation).
  // currentRoundMatches are already stored in display order, so winners[i] is the winner
  // of the i-th match. Pairs of adjacent matches (0+1, 2+3, …) feed into the next round.
  const winners = currentRoundMatches.map(m => m.winnerId).filter(id => id) as string[];

  if (winners.length < 2) {
    const thirdPlaceMatch = (tournament.matches ?? []).find(m =>
      m.round === 'bracket' &&
      m.isThirdPlace &&
      (m.bracketRound ?? 0) === currentRound
    );

    // Keep the tournament active until an enabled third-place match is also
    // complete, otherwise a final played first would hide that match.
    if (!thirdPlaceMatch || thirdPlaceMatch.winnerId) {
      tournament.status = 'completed';
    }
    return [];
  }

  // Determine bestOf based on match count in next round
  const nextMatchCount = Math.floor(winners.length / 2);
  const bestOf = getBestOfForMatchCount(tournament, nextMatchCount);

  // Pair winners sequentially by position: winner[0] vs winner[1], winner[2] vs winner[3], …
  // No re-sorting or re-seeding — the initial bracket already encoded all seeding logic.
  // Re-ordering here is what caused the wrong pairings bug.
  for (let i = 0; i + 1 < winners.length; i += 2) {
    const p1 = winners[i];
    const p2 = winners[i + 1];
    const isBye = p1 === 'BYE' || p2 === 'BYE';
    const newMatch: Match = {
      id: Date.now().toString() + Math.random(),
      tournamentId: tournament.id,
      createdAt: new Date().toISOString(),
      player1Id: p1,
      player2Id: p2,
      round: 'bracket',
      bracketRound: currentRound + 1,
      bestOf: isBye ? 1 : bestOf,
      games: [],
      ...(isBye ? { winnerId: p1 === 'BYE' ? p2 : p1 } : {}),
    };
    newMatches.push(newMatch);
  }

  // The semifinal round is the only round with exactly two standard matches.
  // Create the placement match at the same time as the final, using the
  // semifinal losers as its participants.
  if (
    tournament.bracketConfig?.thirdPlaceMatch &&
    currentRoundMatches.length === 2 &&
    winners.length === 2 &&
    currentRoundMatches.every(m => m.player1Id !== 'BYE' && m.player2Id !== 'BYE') &&
    !(tournament.matches ?? []).some(m => m.isThirdPlace)
  ) {
    const thirdPlaceMatch = createThirdPlaceMatch(tournament);
    if (thirdPlaceMatch) newMatches.push(thirdPlaceMatch);
  }

  return newMatches;
}

/**
 * Finds the latest completed two-match bracket round, which is the semifinal
 * round for a standard single-elimination bracket.
 */
export function getCompletedSemifinalMatches(tournament: Tournament): Match[] {
  const standardMatches = (tournament.matches ?? []).filter(m =>
    m.round === 'bracket' &&
    !m.isThirdPlace &&
    (m.bracketRound ?? 0) > 0
  );
  const rounds = [...new Set(standardMatches.map(m => m.bracketRound ?? 1))]
    .sort((a, b) => b - a);

  for (const round of rounds) {
    const matches = standardMatches.filter(m => (m.bracketRound ?? 1) === round);
    if (
      matches.length === 2 &&
      matches.every(m =>
        Boolean(m.winnerId) &&
        m.player1Id !== 'BYE' &&
        m.player2Id !== 'BYE' &&
        m.winnerId !== 'BYE'
      )
    ) {
      return matches;
    }
  }

  return [];
}

/**
 * Creates the placement match from completed semifinal losers. Returns null
 * when the match already exists or the semifinals are not ready.
 */
export function createThirdPlaceMatch(tournament: Tournament): Match | null {
  if ((tournament.matches ?? []).some(m => m.round === 'bracket' && m.isThirdPlace)) {
    return null;
  }

  const semifinalMatches = getCompletedSemifinalMatches(tournament);
  if (semifinalMatches.length !== 2) return null;

  const semifinalLosers = semifinalMatches.map(match =>
    match.winnerId === match.player1Id ? match.player2Id : match.player1Id
  );
  if (
    semifinalLosers.some(id => id === 'BYE' || id === TBD_PLACEHOLDER || isPlayInWinnerPlaceholder(id)) ||
    semifinalLosers[0] === semifinalLosers[1]
  ) {
    return null;
  }

  const semifinalRound = semifinalMatches[0].bracketRound ?? 1;
  return {
    id: Date.now().toString() + Math.random(),
    tournamentId: tournament.id,
    createdAt: new Date().toISOString(),
    player1Id: semifinalLosers[0],
    player2Id: semifinalLosers[1],
    round: 'bracket',
    bracketRound: semifinalRound + 1,
    bestOf: getBestOfForMatchCount(tournament, semifinalMatches.length),
    games: [],
    isThirdPlace: true,
  };
}

/**
 * Generates the slot-order for a standard single-elimination bracket of size `n` (must be power of 2).
 * Recursively interleaves seeds so that seeds 1 and 2 can only meet in the final,
 * seeds 1-4 can only meet in the semis, etc.
 * Returns an array of 1-based seed positions in match order.
 * Example: n=8 → [1,8, 4,5, 2,7, 3,6]
 */
export function generateBracketSeeding(n: number): number[] {
  if (n === 2) return [1, 2];
  const prev = generateBracketSeeding(n / 2);
  const result: number[] = [];
  for (const seed of prev) {
    result.push(seed);
    result.push(n + 1 - seed);
  }
  return result;
}

/** Returns the number of preliminary matches needed to reach a power-of-two field. */
function getPlayInMatchCount(playerCount: number): number {
  const lowerPowerOfTwo = Math.pow(2, Math.floor(Math.log2(playerCount)));
  return playerCount === lowerPowerOfTwo ? 1 : playerCount - lowerPowerOfTwo;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Creates R1 bracket matches for an even-sized player pool using standard seeding.
 * BYE is used for slots beyond the pool size; bye matches are auto-won.
 */
function createSeededBracketMatches(
  players: string[],
  tournament: Tournament,
  bracketRound = 1,
): Match[] {
  const n = players.length;
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
  const firstRoundMatchCount = nextPowerOf2 / 2;
  const bestOf = getBestOfForMatchCount(tournament, firstRoundMatchCount);
  const seeding = generateBracketSeeding(nextPowerOf2); // array of 1-based positions

  const newMatches: Match[] = [];
  for (let i = 0; i < seeding.length; i += 2) {
    const p1 = seeding[i]     <= n ? players[seeding[i] - 1]     : 'BYE';
    const p2 = seeding[i + 1] <= n ? players[seeding[i + 1] - 1] : 'BYE';
    const isBye = p2 === 'BYE' || p1 === 'BYE';
    newMatches.push({
       id: Date.now().toString() + Math.random(),
       tournamentId: tournament.id,
        createdAt: new Date().toISOString(),
      player1Id: p1,
      player2Id: p2,
      round: 'bracket',
      bracketRound,
      bestOf: isBye ? 1 : bestOf,
      games: [],
      ...(isBye ? { winnerId: p1 === 'BYE' ? p2 : p1 } : {}),
    });
  }
  // Reverse the bottom half so that seed 1 is at the top and seed 2 is at the bottom
  const half = newMatches.length / 2;
  return [...newMatches.slice(0, half), ...newMatches.slice(half).reverse()];
}

export function createBracketMatches(tournament: Tournament, createMainBracket = true): Match[] {
  const newMatches: Match[] = [];
  // Check if bracket matches already exist for round 1
  const existingBracketMatches = (tournament.matches ?? []).filter(m =>
    m.round === 'bracket' &&
    (m.bracketRound || 1) >= 1
  );

  if (existingBracketMatches.length > 0) {
    return []; // Already created
  }

  // Get round robin matches to determine rankings
  const roundRobinMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');

  // Count wins and point differentials for each player (all players, including inactive, for historical accuracy)
  const playerWins: { [key: string]: number } = {};
  const playerPointDiff: { [key: string]: number } = {};
  const playerGamesPlayed: { [key: string]: number } = {};
  tournament.players.forEach(playerId => {
    playerWins[playerId] = 0;
    playerPointDiff[playerId] = 0;
    playerGamesPlayed[playerId] = 0;
  });

  roundRobinMatches.forEach(match => {
    if (match.winnerId) {
      playerWins[match.winnerId] = (playerWins[match.winnerId] || 0) + 1;
    }
    if (match.player2Id !== 'BYE') {
      match.games.forEach(g => {
        playerGamesPlayed[match.player1Id] = (playerGamesPlayed[match.player1Id] || 0) + 1;
        playerGamesPlayed[match.player2Id] = (playerGamesPlayed[match.player2Id] || 0) + 1;
        playerPointDiff[match.player1Id] = (playerPointDiff[match.player1Id] || 0) + g.score1 - g.score2;
        playerPointDiff[match.player2Id] = (playerPointDiff[match.player2Id] || 0) + g.score2 - g.score1;
      });
    }
  });

  // Only rank active players for the bracket
  const activePlayerPool = tournament.activePlayers ?? tournament.players;
  const hasAnyRoundRobinGames = roundRobinMatches.some(match => match.games.length > 0);
  const rankedPlayers = !hasAnyRoundRobinGames
    ? shuffle(activePlayerPool)
    : [
        ...[...activePlayerPool]
          .filter(playerId => (playerGamesPlayed[playerId] || 0) > 0)
          .sort((a, b) => {
            const winsA = playerWins[a] || 0;
            const winsB = playerWins[b] || 0;
            if (winsA !== winsB) return winsB - winsA;
            // Tiebreaker: point differential (more positive = ranked higher)
            const diffA = playerPointDiff[a] || 0;
            const diffB = playerPointDiff[b] || 0;
            if (diffA !== diffB) return diffB - diffA;
            return Math.random() - 0.5;
          }),
        ...shuffle(activePlayerPool.filter(playerId => (playerGamesPlayed[playerId] || 0) === 0)),
      ];

  const bracketPlayers = rankedPlayers;

  // Set player ranking on tournament
  tournament.playerRanking = rankedPlayers;

  const bracketConfig = tournament.bracketConfig || {};
  const playInMode = bracketConfig.playInMode || 'auto';

  const isOdd = bracketPlayers.length % 2 === 1;
  const shouldPlayIn = playInMode === 'force' || (playInMode === 'auto' && isOdd);

  if (bracketPlayers.length >= 2) {
    if (shouldPlayIn) {
      // Create enough preliminary matches to reduce the field to the next
      // lower power of two. For example, 10 players need two play-ins so
      // that six direct entrants plus two winners fill an 8-player bracket.
      const playInMatchCount = getPlayInMatchCount(bracketPlayers.length);
      const directEntrantCount = bracketPlayers.length - playInMatchCount * 2;
      for (let i = 0; i < playInMatchCount; i++) {
        const pairStart = directEntrantCount + i * 2;
        newMatches.push({
          id: Date.now().toString() + Math.random(),
          tournamentId: tournament.id,
          player1Id: bracketPlayers[pairStart],
          player2Id: bracketPlayers[pairStart + 1],
          round: 'bracket',
          bracketRound: 0,
          bestOf: 1,
          games: [],
        });
      }

      if (createMainBracket) {
        const mainBracketPlayers: string[] = [
          ...bracketPlayers.slice(0, directEntrantCount),
          ...Array.from({ length: playInMatchCount }, (_, i) =>
            getPlayInWinnerPlaceholder(i, playInMatchCount)
          ),
        ];
        newMatches.push(...createSeededBracketMatches(mainBracketPlayers, tournament));
      }
    } else {
      // No play-in ( 'none' on odd, or even without force): full n, power-of-2 R1 will
      // contain BYEs for the excess slots. Top seeds get the byes in R1.
      newMatches.push(...createSeededBracketMatches(bracketPlayers, tournament));
    }
  }

  return newMatches;
}

/**
 * Ranks `players` by current round-robin standings: most wins first, ties
 * broken by point differential. Only results among the given `players` are
 * counted, so this works correctly for ranking just an active subset.
 * Shared by the 'top-vs-top' pairing strategy in both `advanceRoundRobinRound`
 * and `resyncRoundRobinMatches`.
 */
function rankPlayersByStandings(players: string[], matches: Match[]): string[] {
  const wins: Record<string, number> = {};
  const pointDiff: Record<string, number> = {};
  players.forEach(p => { wins[p] = 0; pointDiff[p] = 0; });
  matches.forEach(m => {
    if (m.winnerId && players.includes(m.winnerId)) {
      wins[m.winnerId] = (wins[m.winnerId] || 0) + 1;
    }
    if (m.player2Id !== 'BYE') {
      m.games.forEach(g => {
        if (players.includes(m.player1Id)) {
          pointDiff[m.player1Id] = (pointDiff[m.player1Id] || 0) + g.score1 - g.score2;
        }
        if (players.includes(m.player2Id)) {
          pointDiff[m.player2Id] = (pointDiff[m.player2Id] || 0) + g.score2 - g.score1;
        }
      });
    }
  });
  return [...players].sort((a, b) => {
    if (wins[b] !== wins[a]) return wins[b] - wins[a];
    return (pointDiff[b] || 0) - (pointDiff[a] || 0);
  });
}

// Function to advance to next round robin round
export function advanceRoundRobinRound(tournament: Tournament): Match[] {
  // Find the next round number
  const tournamentMatches = (tournament.matches ?? []).filter(m => m.round === 'roundRobin');
  const existingRounds = tournamentMatches.map(m => m.bracketRound || 1);
  const nextRound = existingRounds.length > 0 ? Math.max(...existingRounds) + 1 : 2;

  // Check if we've reached the round robin rounds limit
  if (nextRound > tournament.roundRobinRounds) {
    return []; // No more round robin rounds
  }

  const activePlayers = tournament.activePlayers ?? tournament.players;
  const strategy = tournament.rrPairingStrategy ?? 'random';

  if (strategy === 'top-vs-top') {
    const sortedPlayers = rankPlayersByStandings(activePlayers, tournamentMatches);
    return createRoundRobinPairings(sortedPlayers, tournament.id, nextRound, tournament.rrBestOf ?? 1);
  }

  // Random strategy (default)
  const shuffledPlayers = [...activePlayers].sort(() => Math.random() - 0.5);
  return createRoundRobinPairings(shuffledPlayers, tournament.id, nextRound, tournament.rrBestOf ?? 1);
}

export interface RoundRobinResyncResult {
  /** The tournament's full matches array after resyncing (untouched bracket
   *  matches + untouched earlier RR rounds + the freshly paired current round). */
  matches: Match[];
  /** Newly created matches for the current round — register these in the match index. */
  addedMatches: Match[];
  /** IDs of matches removed by the resync — unregister these from the match index. */
  removedMatchIds: string[];
}

/**
 * Recomputes round-robin pairings for the CURRENT round so that every active
 * player who has not completed a real match yet this round ends up paired
 * exactly once (or given a bye if the pool is odd) — and touches nothing else.
 *
 * Rules implemented:
 * - A player who hasn't played gets added back to the pairing pool — this
 *   covers brand-new players, reactivated players, and players whose
 *   opponent was just removed (they're "unplayed" once their old match is
 *   dropped, same as anyone else without a real result this round).
 * - Players who have already played (a real game was recorded, or they have
 *   a genuine non-BYE winner) are left completely untouched, in every round.
 * - Players who haven't played and get removed are dropped from every
 *   *unplayed* match they're in — including stale leftovers in earlier
 *   rounds, not just the current one.
 * - A BYE match is intentionally NOT treated as "played for real": the bye
 *   holder always returns to the pool so they can be matched against anyone
 *   newly added/reactivated instead of auto-winning by default.
 * - Bracket matches — and everything once the bracket has started — are
 *   never touched.
 *
 * Because the "needs a match" pool is always rebuilt from scratch (rather
 * than patching individual matches in place), a player can never end up in
 * two matches at once. This is what makes the operation safe to run
 * automatically after every roster change, and again on demand via an
 * explicit "Refresh Matches" action, without ever producing duplicates.
 */
export function resyncRoundRobinMatches(tournament: Tournament): RoundRobinResyncResult {
  const allMatches = tournament.matches ?? [];

  const bracketStarted = Boolean(
    tournament.bracketStartedAt ||
    allMatches.some(m => m.round === 'bracket') ||
    tournament.status === 'bracket' ||
    tournament.status === 'completed'
  );
  if (bracketStarted) {
    // Never touch round-robin history once the tournament has moved past it.
    return { matches: allMatches, addedMatches: [], removedMatchIds: [] };
  }

  const nonRRMatches = allMatches.filter(m => m.round !== 'roundRobin');
  const rrMatches    = allMatches.filter(m => m.round === 'roundRobin');

  const currentRound = rrMatches.length > 0
    ? Math.max(...rrMatches.map(m => m.bracketRound ?? 1))
    : 1;

  const currentRoundMatches = rrMatches.filter(m => (m.bracketRound ?? 1) === currentRound);
  const otherRoundMatches   = rrMatches.filter(m => (m.bracketRound ?? 1) !== currentRound);

  // "Played for real": has a recorded game, or a genuine (non-BYE) winner.
  const isLocked = (m: Match) =>
    m.games.length > 0 || (!!m.winnerId && m.player1Id !== 'BYE' && m.player2Id !== 'BYE');

  const activePlayers = tournament.activePlayers ?? tournament.players;
  const activeSet = new Set(activePlayers);

  // Defensive cleanup of earlier rounds: an unplayed match left behind for a
  // player who is no longer active is stale and gets dropped. Played matches
  // are always kept, regardless of a participant's current active status.
  const keptOtherRoundMatches: Match[] = [];
  const staleOtherRoundMatchIds: string[] = [];
  for (const m of otherRoundMatches) {
    const stillValid = isLocked(m) ||
      (activeSet.has(m.player1Id) && (m.player2Id === 'BYE' || activeSet.has(m.player2Id)));
    if (stillValid) keptOtherRoundMatches.push(m);
    else staleOtherRoundMatchIds.push(m.id);
  }

  const lockedMatches   = currentRoundMatches.filter(isLocked);
  const unlockedMatches = currentRoundMatches.filter(m => !isLocked(m));
  const lockedPlayerIds = new Set(lockedMatches.flatMap(m => [m.player1Id, m.player2Id]));

  // Everyone active who doesn't already have a real result this round needs
  // to be (re)paired: brand-new players, reactivated players, players whose
  // opponent was removed, and bye holders all fall into this pool. Rebuilding
  // it from `activePlayers` (rather than patching old matches) guarantees no
  // player can ever appear in more than one match this round.
  const pool = activePlayers.filter(pid => !lockedPlayerIds.has(pid));

  const orderedPool = (tournament.rrPairingStrategy ?? 'random') === 'top-vs-top'
    ? rankPlayersByStandings(pool, rrMatches)
    : [...pool].sort(() => Math.random() - 0.5);

  const addedMatches = createRoundRobinPairings(orderedPool, tournament.id, currentRound, tournament.rrBestOf ?? 1);

  const removedMatchIds = [...unlockedMatches.map(m => m.id), ...staleOtherRoundMatchIds];
  const matches = [...nonRRMatches, ...keptOtherRoundMatches, ...lockedMatches, ...addedMatches];

  return { matches, addedMatches, removedMatchIds };
}
