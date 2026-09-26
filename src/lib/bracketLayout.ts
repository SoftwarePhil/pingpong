export type BracketCardLayer = 'main' | 'playIn';

export function getBracketSlotOffset(isTopSlot: boolean): number {
  return isTopSlot ? 1 / 4 : 3 / 4;
}

export function orderPlayInIndexesByTarget(
  playInCount: number,
  targetIndexes: number[],
): number[] {
  return Array.from({ length: playInCount }, (_, index) => index)
    .sort((a, b) => (targetIndexes[a] ?? Number.MAX_SAFE_INTEGER) - (targetIndexes[b] ?? Number.MAX_SAFE_INTEGER) || a - b);
}

export function getPlayInTargetIndex(
  matches: Array<{ player1Id: string; player2Id: string }>,
  placeholder: string,
  participantIds: string[],
  winnerId?: string,
): number {
  return matches.findIndex(match => {
    const slots = [match.player1Id, match.player2Id];
    return slots.some(id => id === placeholder || id === winnerId || participantIds.includes(id));
  });
}

export function shouldUseStraightPlayInConnector(sourceY: number, targetY: number): boolean {
  return Math.abs(sourceY - targetY) <= 8;
}

/** Keeps play-in cards above the main bracket when their geometry overlaps. */
export function getBracketCardZIndex(layer: BracketCardLayer, active = false): number {
  if (active) return 4;
  return layer === 'playIn' ? 3 : 1;
}
