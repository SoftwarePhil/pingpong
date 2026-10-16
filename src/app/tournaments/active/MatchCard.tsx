'use client';

import { useState } from 'react';
import { Match, Game, MARKER_PLAYER_ID } from '../../../types/pingpong';
import { getMatchSides, getWinningSide, isByeMatch, isDoublesMatch, isMatchComplete } from '../../../lib/matchFormat';
import { validateScore } from '../../../lib/scoring';

interface MatchCardProps {
  match: Match;
  tournamentPlayers: string[];
  getPlayerName: (id: string) => string;
  onAddGame: (match: Match, score1: number, score2: number) => void;
  onDeleteMatch: (matchId: string) => void;
  onDeleteGame: (gameId: string) => void;
  onSaveGameEdit: (gameId: string, score1: number, score2: number) => void;
  onSwapPlayers: (matchId: string, player1Id: string, player2Id: string) => void;
  onAddMarker: (matchId: string) => void;
  readOnly?: boolean;
}

export default function MatchCard({
  match,
  tournamentPlayers,
  getPlayerName,
  onAddGame,
  onDeleteMatch,
  onDeleteGame,
  onSaveGameEdit,
  onSwapPlayers,
  onAddMarker,
  readOnly = false,
}: MatchCardProps) {
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [swapP1, setSwapP1] = useState(match.player1Id);
  const [swapP2, setSwapP2] = useState(match.player2Id);
  const [side1, side2] = getMatchSides(match);
  const doubles = isDoublesMatch(match);
  const winningSide = getWinningSide(match);
  const sideName = (side: string[]) => side.map(getPlayerName).join(' + ');

  const startEditingGame = (game: Game) => {
    setEditingGame(game);
    setEditScore1(game.score1.toString());
    setEditScore2(game.score2.toString());
  };

  const cancelEditingGame = () => {
    setEditingGame(null);
    setEditScore1('');
    setEditScore2('');
  };

  const handleSaveGameEdit = () => {
    if (!editingGame) return;
    const s1 = parseInt(editScore1);
    const s2 = parseInt(editScore2);
    const scoreError = validateScore(s1, s2);
    if (scoreError) { alert(scoreError); return; }
    onSaveGameEdit(editingGame.id, s1, s2);
    cancelEditingGame();
  };

  const handleSwapSave = () => {
    if (swapP1 === swapP2) { alert('Player 1 and Player 2 must be different'); return; }
    onSwapPlayers(match.id, swapP1, swapP2);
    setSwapping(false);
  };

  const canSwap = !readOnly && !doubles && match.round === 'roundRobin' && match.games.length === 0 && !isMatchComplete(match) && match.player2Id !== MARKER_PLAYER_ID;
  const isBye = isByeMatch(match);

  const sideWins = [
    match.games.filter(g => g.score1 > g.score2).length,
    match.games.filter(g => g.score2 > g.score1).length,
  ];
  const canRecord = !readOnly && match.games.length < match.bestOf && !isMatchComplete(match) && !isBye;

  const sideRow = (side: 1 | 2, ids: string[]) => {
    const won = winningSide === side;
    const decided = winningSide !== undefined;
    return (
      <div className={`flex items-center gap-3 px-4 py-2.5 ${won ? 'bg-win-soft' : ''}`}>
        <span
          className={`min-w-0 flex-1 truncate ${won ? 'font-bold text-ink' : decided ? 'text-muted' : 'font-semibold text-ink'}`}
          title={sideName(ids)}
        >
          {sideName(ids)}
        </span>
        {won && <span className="label-caps text-win">Won</span>}
        <span className={`font-digits w-6 text-right text-2xl ${won ? 'text-win' : decided ? 'text-muted' : 'text-ink'}`}>
          {sideWins[side - 1]}
        </span>
      </div>
    );
  };

  // Typed scores use the scoreboard digits; the placeholder is the player's name.
  const scoreInputClass = 'form-control font-digits min-w-0 flex-1 rounded-md px-2 py-1.5 text-center text-lg placeholder:text-sm placeholder:font-semibold placeholder:[font-stretch:100%]';

  const iconButton = 'rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-sunken hover:text-ink';

  return (
    <article className="surface-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="label-caps text-muted">
          {match.round === 'bracket'
            ? match.bracketRound === 0 ? 'Play-in' : `Bracket round ${match.bracketRound}`
            : doubles ? '2v2' : isBye ? 'Bye' : 'Singles'}
          <span className="ml-2 font-normal normal-case tracking-normal">best of {match.bestOf}</span>
        </span>
        <div className="flex items-center gap-0.5">
          {canSwap && (
            <button
              type="button"
              onClick={() => { setSwapping(!swapping); setSwapP1(match.player1Id); setSwapP2(match.player2Id); }}
              className={iconButton}
              title="Change players"
            >
              Swap
            </button>
          )}
          {!readOnly && !doubles && match.round === 'roundRobin' && isBye && (
            <button type="button" onClick={() => onAddMarker(match.id)} className={iconButton}>
              Add marker
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onDeleteMatch(match.id)}
              className={`${iconButton} hover:bg-loss-soft hover:text-loss`}
              title="Delete match"
              aria-label="Delete match"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {swapping && (
        <div className="space-y-2 border-b border-line bg-table-soft px-4 py-3">
          <p className="text-sm font-semibold text-ink">Change players</p>
          <select value={swapP1} onChange={e => setSwapP1(e.target.value)} className="form-control w-full rounded-md px-2 py-1.5 text-sm" aria-label="Player 1">
            {tournamentPlayers.map(pid => <option key={pid} value={pid}>{getPlayerName(pid)}</option>)}
          </select>
          <select value={swapP2} onChange={e => setSwapP2(e.target.value)} className="form-control w-full rounded-md px-2 py-1.5 text-sm" aria-label="Player 2">
            {tournamentPlayers.map(pid => <option key={pid} value={pid}>{getPlayerName(pid)}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={handleSwapSave} className="button button-primary button-sm flex-1">Save</button>
            <button type="button" onClick={() => setSwapping(false)} className="button button-secondary button-sm flex-1">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-line">
        {sideRow(1, side1)}
        {isBye
          ? <p className="px-4 py-2.5 text-sm text-muted">Bye — advances automatically</p>
          : sideRow(2, side2)}
      </div>

      {canRecord && (
        <form
          onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            const score1 = parseInt(fd.get('score1') as string);
            const score2 = parseInt(fd.get('score2') as string);
            const scoreError = validateScore(score1, score2);
            if (scoreError) { alert(scoreError); return; }
            onAddGame(match, score1, score2);
            (e.target as HTMLFormElement).reset();
          }}
          className="space-y-2 border-t border-line bg-surface-sunken px-4 py-3"
        >
          {/* Each box is labelled with its player so scores can't be entered the wrong way round. */}
          <div className="flex items-center gap-2">
            <input name="score1" type="number" min="0" max="50" required
              aria-label={`${sideName(side1)} score`} placeholder={sideName(side1)} title={sideName(side1)}
              className={scoreInputClass} />
            <span className="text-muted">–</span>
            <input name="score2" type="number" min="0" max="50" required
              aria-label={`${sideName(side2)} score`} placeholder={sideName(side2)} title={sideName(side2)}
              className={scoreInputClass} />
          </div>
          <button type="submit" className="button button-primary button-sm w-full">Record game</button>
        </form>
      )}

      {match.games.length > 0 && (
        <ol className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3">
          {match.games.map((game, index) => (
            <li key={game.id}>
              {editingGame?.id === game.id ? (
                <span className="flex items-center gap-1.5">
                  <input type="number" value={editScore1} onChange={e => setEditScore1(e.target.value)} aria-label="Side 1 score"
                    className="form-control font-digits w-12 rounded-md px-1 py-0.5 text-center" />
                  <span className="text-muted">–</span>
                  <input type="number" value={editScore2} onChange={e => setEditScore2(e.target.value)} aria-label="Side 2 score"
                    className="form-control font-digits w-12 rounded-md px-1 py-0.5 text-center" />
                  <button type="button" onClick={handleSaveGameEdit} className="text-xs font-semibold text-win hover:underline">Save</button>
                  <button type="button" onClick={cancelEditingGame} className="text-xs font-semibold text-muted hover:underline">Cancel</button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-sm">
                  <span className="text-xs text-muted">G{index + 1}</span>
                  <span className="font-digits text-ink">{game.score1}–{game.score2}</span>
                  {!readOnly && (
                    <>
                      <button type="button" onClick={() => startEditingGame(game)} className="ml-1 text-xs font-semibold text-table hover:underline">Edit</button>
                      <button type="button" onClick={() => onDeleteGame(game.id)} aria-label={`Delete game ${index + 1}`} className="text-xs text-muted hover:text-loss">✕</button>
                    </>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
