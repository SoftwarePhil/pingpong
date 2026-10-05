'use client';

import { useMemo, useState } from 'react';
import { BracketMatch, BracketPlayer, DisplayMatch } from './core/types';
import { isPlaceholderMatch } from './core/model';
import { computeBracketLayout } from './core/layout';
import { BracketMode, canSelectMatch, canSwapMatch, getEligibleSwapPlayers, isEditable } from './core/interaction';
import { BracketCanvas } from './BracketCanvas';
import { ChampionBanner } from './ChampionBanner';
import { MatchEditor, MatchEditorCallbacks } from './MatchEditor';
import { MatchResult } from './MatchResult';

export interface BracketViewProps<M extends BracketMatch> extends MatchEditorCallbacks<M> {
  /** Bracket matches only: play-ins (round 0), main rounds and the third-place match. */
  bracketMatches: M[];
  getPlayerName: (id: string) => string;
  /** Profiles used for avatars. Players without a profile show their initial. */
  players?: BracketPlayer[];
  /** Viewer cannot record or change anything. */
  readOnly?: boolean;
  /** Bracket is a preview before it starts: players and byes can be rearranged, games cannot be recorded. */
  previewMode?: boolean;
  /** Draw a third-place slot, including before the placement match exists. */
  showThirdPlace?: boolean;
}

/**
 * Single-elimination bracket with optional play-in round and third-place
 * match. Clicking a card opens it for scoring, player changes or, for
 * read-only viewers, the game-by-game result.
 */
export function BracketView<M extends BracketMatch>({
  bracketMatches,
  getPlayerName,
  players = [],
  readOnly = false,
  previewMode = false,
  showThirdPlace = false,
  ...callbacks
}: BracketViewProps<M>) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const mode: BracketMode = { readOnly, previewMode };

  const layout = useMemo(
    () => computeBracketLayout(bracketMatches, { showThirdPlace }),
    [bracketMatches, showThirdPlace],
  );
  const playersById = useMemo(() => new Map(players.map(player => [player.id, player])), [players]);

  if (!layout) {
    return <div className="text-center py-16 text-gray-400 text-sm">No bracket matches yet.</div>;
  }

  const activeMatch = bracketMatches.find(match => match.id === activeMatchId);
  const close = () => setActiveMatchId(null);

  const getSelectHandler = (match: DisplayMatch<M>) => {
    if (isPlaceholderMatch(match) || !canSelectMatch(match, mode)) return undefined;
    return () => setActiveMatchId(current => current === match.id ? null : match.id);
  };

  return (
    <div className="space-y-4">
      {layout.championMatch && <ChampionBanner finalMatch={layout.championMatch} getPlayerName={getPlayerName} />}

      <BracketCanvas
        layout={layout}
        activeMatchId={activeMatchId}
        getPlayerName={getPlayerName}
        getPlayer={id => playersById.get(id)}
        getSelectHandler={getSelectHandler}
      />

      {activeMatch && isEditable(mode) && (
        <MatchEditor
          key={activeMatch.id}
          match={activeMatch}
          getPlayerName={getPlayerName}
          previewMode={previewMode}
          canSwap={Boolean(callbacks.onSwapPlayers) && canSwapMatch(activeMatch, bracketMatches, mode)}
          eligibleSwapPlayers={getEligibleSwapPlayers(activeMatch, bracketMatches)}
          onClose={close}
          {...callbacks}
        />
      )}

      {activeMatch && !isEditable(mode) && activeMatch.winnerId && activeMatch.games.length > 0 && (
        <MatchResult match={activeMatch} getPlayerName={getPlayerName} onClose={close} />
      )}
    </div>
  );
}
