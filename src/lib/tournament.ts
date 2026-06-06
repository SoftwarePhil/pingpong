import { Tournament, Match } from '../types/pingpong';

/** Returns the configured bestOf for a bracket round with the given match count.
 * Falls back to 1 if no config entry matches. */
function getBestOfForMatchCount(tournament: Tournament, matchCount: number): number {
  const config = tournament.bracketRounds.find(b => b.matchCount === matchCount);
  return config?.bestOf ?? 1;
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

  const oldPlayers = [target.player1Id, target.player2Id].filter(p => p !== 'BYE' && p !== 'PLAY_IN_WINNER');
  const newPlayers = [newPlayer1Id, newPlayer2Id].filter(p => p !== 'BYE' && p !== 'PLAY_IN_WINNER');
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

  const oldPlayers = [target.player1Id, target.player2Id].filter(p => p !== 'BYE' && p !== 'PLAY_IN_WINNER');
  const newPlayers = [newPlayer1Id, newPlayer2Id].filter(p => p !== 'BYE' && p !== 'PLAY_IN_WINNER');
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
    m => m.round === 'bracket' && (m.bracketRound ?? 0) > 0
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
    // Tournament completed
    tournament.status = 'completed';
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

  return newMatches;
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
  tournament.players.forEach(playerId => {
    playerWins[playerId] = 0;
    playerPointDiff[playerId] = 0;
  });

  roundRobinMatches.forEach(match => {
    if (match.winnerId) {
      playerWins[match.winnerId] = (playerWins[match.winnerId] || 0) + 1;
    }
    if (match.player2Id !== 'BYE') {
      match.games.forEach(g => {
        playerPointDiff[match.player1Id] = (playerPointDiff[match.player1Id] || 0) + g.score1 - g.score2;
        playerPointDiff[match.player2Id] = (playerPointDiff[match.player2Id] || 0) + g.score2 - g.score1;
      });
    }
  });

  // Only rank active players for the bracket
  const activePlayerPool = tournament.activePlayers ?? tournament.players;
  const rankedPlayers = [...activePlayerPool].sort((a, b) => {
    const winsA = playerWins[a] || 0;
    const winsB = playerWins[b] || 0;
    if (winsA !== winsB) return winsB - winsA;
    // Tiebreaker: point differential (more positive = ranked higher)
    const diffA = playerPointDiff[a] || 0;
    const diffB = playerPointDiff[b] || 0;
    if (diffA !== diffB) return diffB - diffA;
    return Math.random() - 0.5;
  });

  const bracketPlayers = rankedPlayers;

  // Set player ranking on tournament
  tournament.playerRanking = rankedPlayers;

  const bracketConfig = tournament.bracketConfig || {};
  const playInMode = bracketConfig.playInMode || 'auto';

  const isOdd = bracketPlayers.length % 2 === 1;
  const shouldPlayIn = playInMode === 'force' || (playInMode === 'auto' && isOdd);

  if (bracketPlayers.length >= 2) {
    if (shouldPlayIn) {
      // Play-in round (prelim for odd or forced): bottom two lowest seeds play each other.
      // This is bracketRound 0 (special prelim). The main bracket is then created on the
      // reduced set (n-1 players: top n-2 + PLAY_IN_WINNER placeholder) so that the main
      // R1 is a clean power-of-2 with no extra byes in the main bracket's first round.
      // For 9 players: 1 play-in + 4 matches in main R1 (for the 8 advancers).
      const playInMatch: Match = {
        id: Date.now().toString() + Math.random(),
        tournamentId: tournament.id,
        player1Id: bracketPlayers[bracketPlayers.length - 2],
        player2Id: bracketPlayers[bracketPlayers.length - 1],
        round: 'bracket',
        bracketRound: 0,
        bestOf: 1,
        games: [],
      };
      newMatches.push(playInMatch);

      if (createMainBracket) {
        const mainBracketPlayers: string[] = [
          ...bracketPlayers.slice(0, bracketPlayers.length - 2),
          'PLAY_IN_WINNER',
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
    // Sort players by current standings: wins then point differential
    const playerWins: Record<string, number> = {};
    const playerPointDiff: Record<string, number> = {};
    activePlayers.forEach(p => { playerWins[p] = 0; playerPointDiff[p] = 0; });
    tournamentMatches.forEach(m => {
      if (m.winnerId && activePlayers.includes(m.winnerId)) {
        playerWins[m.winnerId] = (playerWins[m.winnerId] || 0) + 1;
      }
      if (m.player2Id !== 'BYE') {
        m.games.forEach(g => {
          if (activePlayers.includes(m.player1Id)) {
            playerPointDiff[m.player1Id] = (playerPointDiff[m.player1Id] || 0) + g.score1 - g.score2;
          }
          if (activePlayers.includes(m.player2Id)) {
            playerPointDiff[m.player2Id] = (playerPointDiff[m.player2Id] || 0) + g.score2 - g.score1;
          }
        });
      }
    });
    const sortedPlayers = [...activePlayers].sort((a, b) => {
      if (playerWins[b] !== playerWins[a]) return playerWins[b] - playerWins[a];
      return (playerPointDiff[b] || 0) - (playerPointDiff[a] || 0);
    });
    return createRoundRobinPairings(sortedPlayers, tournament.id, nextRound, tournament.rrBestOf ?? 1);
  }

  // Random strategy (default)
  const shuffledPlayers = [...activePlayers].sort(() => Math.random() - 0.5);
  return createRoundRobinPairings(shuffledPlayers, tournament.id, nextRound, tournament.rrBestOf ?? 1);
}
