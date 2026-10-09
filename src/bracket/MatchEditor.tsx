'use client';

import { useState } from 'react';
import { BracketMatch } from './core/types';
import { BYE_PLACEHOLDER, getSeriesScore } from './core/model';
import { getByeHolder } from './core/interaction';

export interface MatchEditorCallbacks<M extends BracketMatch> {
  onAddGame?: (match: M, score1: number, score2: number) => Promise<void>;
  onSaveGameEdit?: (gameId: string, score1: number, score2: number) => Promise<void>;
  onDeleteGame?: (gameId: string) => Promise<void>;
  onChangeBestOf?: (matchId: string, bestOf: number) => Promise<void>;
  onSwapPlayers?: (matchId: string, player1Id: string, player2Id: string) => Promise<void>;
  /**
   * Checks a game score before it is recorded or edited. Returns an error
   * message, or null when the score is valid. Without it, only whole numbers
   * are required and the host's server has the final say.
   */
  validateGameScore?: (score1: number, score2: number) => string | null;
}

interface MatchEditorProps<M extends BracketMatch> extends MatchEditorCallbacks<M> {
  match: M;
  getPlayerName: (id: string) => string;
  previewMode: boolean;
  /** Whether this match's participants may be reassigned. */
  canSwap: boolean;
  eligibleSwapPlayers: string[];
  onClose: () => void;
}

const BEST_OF_OPTIONS = [1, 3, 5];
const selectClass = 'w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-blue-400 focus:outline-none';
const scoreInputClass = 'w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-2xl font-bold text-center text-gray-900 focus:border-blue-400 focus:outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed';
const gameEditInputClass = 'w-12 border border-gray-300 rounded-lg px-1.5 py-1 text-sm text-center font-bold text-gray-900 bg-white focus:border-blue-400 focus:outline-none';

/**
 * Panel for the selected match: records games and edits the series, or
 * reassigns players and byes. Render it with `key={match.id}` so its state
 * starts fresh for each match.
 */
export function MatchEditor<M extends BracketMatch>({
  match,
  getPlayerName,
  previewMode,
  canSwap,
  eligibleSwapPlayers,
  onClose,
  onAddGame,
  onSaveGameEdit,
  onDeleteGame,
  onChangeBestOf,
  onSwapPlayers,
  validateGameScore,
}: MatchEditorProps<M>) {
  const byeHolder = getByeHolder(match);
  const isBye = byeHolder !== undefined;

  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [swapMode, setSwapMode] = useState(isBye);
  // For a bye, the first select holds the real player and the bye stays on its side.
  const [swapP1, setSwapP1] = useState(byeHolder ?? match.player1Id);
  const [swapP2, setSwapP2] = useState(isBye ? BYE_PLACEHOLDER : match.player2Id);

  const checkScore = (s1: number, s2: number) =>
    Number.isNaN(s1) || Number.isNaN(s2) ? 'Enter valid scores' : validateGameScore?.(s1, s2) ?? null;

  const showSwapForm = swapMode || isBye || previewMode;
  const seriesComplete = match.games.length >= match.bestOf;
  const [side1Wins, side2Wins] = getSeriesScore(match);

  const handleRecord = async () => {
    if (!onAddGame) return;
    if (match.games.length >= match.bestOf) return;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    const scoreError = checkScore(s1, s2);
    if (scoreError) { alert(scoreError); return; }
    await onAddGame(match, s1, s2);
    setScore1('');
    setScore2('');
  };

  const handleSwapSave = async () => {
    if (!onSwapPlayers) return;
    if (isBye) {
      const byeOnSide1 = match.player1Id === BYE_PLACEHOLDER;
      await onSwapPlayers(match.id, byeOnSide1 ? BYE_PLACEHOLDER : swapP1, byeOnSide1 ? swapP1 : BYE_PLACEHOLDER);
    } else {
      if (swapP1 === swapP2) { alert('Player 1 and Player 2 must be different'); return; }
      await onSwapPlayers(match.id, swapP1, swapP2);
    }
    onClose();
  };

  const handleSaveGameEdit = async (gameId: string) => {
    if (!onSaveGameEdit) return;
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    const scoreError = checkScore(s1, s2);
    if (scoreError) { alert(scoreError); return; }
    await onSaveGameEdit(gameId, s1, s2);
    setEditingGameId(null);
  };

  const heading = previewMode
    ? (swapMode ? 'Change players / bye (preview)' : 'Adjust this match')
    : swapMode
    ? (isBye ? 'Change Bye' : 'Change Players')
    : match.winnerId
    ? 'Match complete — edit if needed'
    : 'Recording game';

  const playerSelect = (value: string, onChange: (id: string) => void) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectClass}>
      {eligibleSwapPlayers.map(id => (
        <option key={id} value={id}>{getPlayerName(id)}</option>
      ))}
    </select>
  );

  const scoreInput = (value: string, onChange: (value: string) => void) => (
    <input
      type="number" min="0" max="50" value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && handleRecord()}
      disabled={seriesComplete}
      className={scoreInputClass}
      placeholder="0"
    />
  );

  return (
    <div className="bg-white border-2 border-blue-100 rounded-2xl p-5 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-0.5">{heading}</p>
          <h4 className="font-bold text-gray-900 text-base">
            {getPlayerName(match.player1Id)}
            {isBye ? (
              <span className="text-gray-400 text-sm font-normal ml-2">(bye)</span>
            ) : (
              <>
                <span className="text-gray-300 mx-2">vs</span>
                {getPlayerName(match.player2Id)}
              </>
            )}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {canSwap && !isBye && !previewMode && (
            <button
              onClick={() => setSwapMode(on => !on)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${swapMode ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'}`}
              title="Change players in this match"
            >
              ↔ Players
            </button>
          )}
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl font-bold leading-none">✕</button>
        </div>
      </div>

      {showSwapForm ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {isBye ? (
              <>
                <label className="block text-xs text-gray-500 font-medium">Who gets this bye?</label>
                {playerSelect(swapP1, setSwapP1)}
              </>
            ) : (
              <>
                <label className="block text-xs text-gray-500 font-medium">Player 1</label>
                {playerSelect(swapP1, setSwapP1)}
                <div className="text-center text-xs text-gray-400 font-bold py-1">vs</div>
                {playerSelect(swapP2, setSwapP2)}
              </>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSwapSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2.5 rounded-xl font-bold transition-colors">
              Save
            </button>
            <button onClick={() => { setSwapMode(false); if (isBye) onClose(); }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2.5 rounded-xl font-bold transition-colors">
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center">Displaced players are moved to other unplayed matches in the same round</p>
          {previewMode && (
            <p className="text-[11px] text-blue-600 text-center font-medium">Preview mode — apply your changes, then start the bracket to commit this structure.</p>
          )}
        </div>
      ) : (
        <>
          {onChangeBestOf && (
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
              <span className="text-xs text-gray-500 font-medium">Best of</span>
              <div className="flex gap-1">
                {BEST_OF_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => onChangeBestOf(match.id, n)}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                      match.bestOf === n
                        ? 'bg-blue-600 text-white border-blue-700'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {match.winnerId && (
                <span className="text-[11px] text-amber-600 ml-1">Changing games may correct the winner and later-round matches</span>
              )}
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 font-medium mb-1.5">{getPlayerName(match.player1Id)}</label>
              {scoreInput(score1, setScore1)}
            </div>
            <div className="pb-3 text-2xl text-gray-200 font-bold select-none">—</div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 font-medium mb-1.5">{getPlayerName(match.player2Id)}</label>
              {scoreInput(score2, setScore2)}
            </div>
            <div className="flex-shrink-0">
              <div className="h-[21px] mb-1.5" />
              <button
                onClick={handleRecord}
                disabled={seriesComplete}
                title={seriesComplete ? `Series is already complete (Bo${match.bestOf}) — increase "Best of" above to record more games` : undefined}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-colors shadow-sm whitespace-nowrap disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-200"
              >
                ✓ Record
              </button>
            </div>
          </div>

          {seriesComplete && (
            <p className="mt-2 text-xs text-amber-600 text-center">
              Series complete at Bo{match.bestOf} — increase &quot;Best of&quot; above to record additional games.
            </p>
          )}

          {match.games.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Series so far (Bo{match.bestOf})</p>
              <div className="flex flex-wrap gap-2 items-center">
                {match.games.map((game, index) => {
                  if (editingGameId === game.id) {
                    return (
                      <div key={game.id} className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-1.5 border-2 border-blue-200">
                        <span className="text-xs text-gray-500 font-semibold">G{index + 1}:</span>
                        <input type="number" value={editScore1} onChange={e => setEditScore1(e.target.value)} className={gameEditInputClass} />
                        <span className="text-gray-400 text-xs">–</span>
                        <input type="number" value={editScore2} onChange={e => setEditScore2(e.target.value)} className={gameEditInputClass} />
                        <button onClick={() => handleSaveGameEdit(game.id)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-bold transition-colors">✓</button>
                        <button onClick={() => setEditingGameId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600 px-1 font-bold">✕</button>
                      </div>
                    );
                  }
                  const side1Won = game.score1 > game.score2;
                  return (
                    <div key={game.id} className={`flex items-center gap-1 text-xs font-bold pl-2.5 pr-1 py-1 rounded-full border ${
                      side1Won ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      <button
                        onClick={() => { setEditingGameId(game.id); setEditScore1(String(game.score1)); setEditScore2(String(game.score2)); }}
                        className="hover:opacity-70 transition-opacity"
                      >
                        G{index + 1}: {game.score1}–{game.score2}
                      </button>
                      {onDeleteGame && (
                        <button
                          onClick={() => onDeleteGame(game.id)}
                          title="Delete this game"
                          className="text-gray-400 hover:text-red-600 px-1 leading-none"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                <span className="text-xs text-gray-400">{side1Wins}–{side2Wins} in series</span>
              </div>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-400 text-center">First to 11 · win by 2</p>
        </>
      )}
    </div>
  );
}
