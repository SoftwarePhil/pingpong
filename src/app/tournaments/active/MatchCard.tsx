'use client';

import { useState } from 'react';
import { Match, Game } from '../../../types/pingpong';

interface MatchCardProps {
  match: Match;
  tournamentPlayers: string[];
  getPlayerName: (id: string) => string;
  onAddGame: (match: Match, score1: number, score2: number) => void;
  onDeleteMatch: (matchId: string) => void;
  onDeleteGame: (gameId: string) => void;
  onSaveGameEdit: (gameId: string, score1: number, score2: number) => void;
  onSwapPlayers: (matchId: string, player1Id: string, player2Id: string) => void;
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
}: MatchCardProps) {
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editScore1, setEditScore1] = useState('');
  const [editScore2, setEditScore2] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [swapP1, setSwapP1] = useState(match.player1Id);
  const [swapP2, setSwapP2] = useState(match.player2Id);

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
    if (isNaN(s1) || isNaN(s2)) { alert('Please enter valid scores'); return; }
    onSaveGameEdit(editingGame.id, s1, s2);
    cancelEditingGame();
  };

  const handleSwapSave = () => {
    if (swapP1 === swapP2) { alert('Player 1 and Player 2 must be different'); return; }
    onSwapPlayers(match.id, swapP1, swapP2);
    setSwapping(false);
  };

  const canSwap = match.round === 'roundRobin' && match.games.length === 0 && !match.winnerId;

  return (
    <div className="panel overflow-hidden">
      {/* Card header */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
        <span className="eyebrow" style={{ fontSize: '0.6rem' }}>
          {match.round === 'bracket'
            ? match.bracketRound === 0 ? 'Play-in' : `Round ${match.bracketRound}`
            : `RR Round ${match.bracketRound ?? 1}`}
        </span>
        <div className="flex items-center gap-1">
          <span className="badge">Bo{match.bestOf}</span>
          {canSwap && (
            <button
              onClick={() => { setSwapping(!swapping); setSwapP1(match.player1Id); setSwapP2(match.player2Id); }}
              className="text-gold hover:text-[var(--gold-bright)] px-1.5 py-0.5 rounded text-xs transition-colors"
              title="Change players"
            >
              ↔
            </button>
          )}
          <button
            onClick={() => onDeleteMatch(match.id)}
            className="text-dim hover:text-loss px-1.5 py-0.5 rounded text-xs transition-colors"
            title="Delete match"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Player swap panel */}
      {swapping && (
        <div className="px-4 py-3 border-b border-[var(--border-gold)] bg-[rgba(232,184,74,0.06)]">
          <p className="eyebrow mb-2">Change Players</p>
          <div className="space-y-1.5">
            <select value={swapP1} onChange={e => setSwapP1(e.target.value)} className="select text-sm py-1.5">
              {tournamentPlayers.map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="text-center text-xs text-dim font-bold">vs</div>
            <select value={swapP2} onChange={e => setSwapP2(e.target.value)} className="select text-sm py-1.5">
              {tournamentPlayers.map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSwapSave} className="btn btn-primary btn-sm flex-1">Save</button>
              <button onClick={() => setSwapping(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Players */}
      <div className="px-4 py-3 space-y-2">
        <div className={`flex justify-between items-center px-3 py-2 rounded border ${
          match.winnerId === match.player1Id
            ? 'bg-[rgba(94,234,154,0.1)] border-[rgba(94,234,154,0.35)]'
            : 'bg-[var(--bg-elevated)] border-[var(--border)]'
        }`}>
          <span className="font-medium truncate mr-2 text-sm" title={getPlayerName(match.player1Id)}>
            {getPlayerName(match.player1Id)}
          </span>
          <span className="text-xs font-bold flex-shrink-0 score text-muted">
            {match.games.filter(g => g.score1 > g.score2).length}W
          </span>
        </div>

        <div className="text-center text-xs text-dim font-mono tracking-widest">
          {match.player2Id === 'BYE' ? 'BYE' : 'VS'}
        </div>

        {match.player2Id !== 'BYE' && (
          <div className={`flex justify-between items-center px-3 py-2 rounded border ${
            match.winnerId === match.player2Id
              ? 'bg-[rgba(94,234,154,0.1)] border-[rgba(94,234,154,0.35)]'
              : 'bg-[var(--bg-elevated)] border-[var(--border)]'
          }`}>
            <span className="font-medium truncate mr-2 text-sm" title={getPlayerName(match.player2Id)}>
              {getPlayerName(match.player2Id)}
            </span>
            <span className="text-xs font-bold flex-shrink-0 score text-muted">
              {match.games.filter(g => g.score2 > g.score1).length}W
            </span>
          </div>
        )}
      </div>

      {/* Winner badge */}
      {match.winnerId && (
        <div className="px-4 pb-3 text-center">
          <span className="badge badge-gold">
            ★ {getPlayerName(match.winnerId)}
          </span>
        </div>
      )}

      {/* Score entry form */}
      {match.games.length < match.bestOf && !match.winnerId && match.player2Id !== 'BYE' && (
        <form
          onSubmit={e => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            const score1 = parseInt(fd.get('score1') as string);
            const score2 = parseInt(fd.get('score2') as string);
            //DO NOT CHANGE THIS BLOCK OF CODE
            const maxScore = Math.max(score1, score2);
            const minScore = Math.min(score1, score2);
            const scoreDifference = maxScore - minScore;
            //DO NOT CHANGE THIS BLOCK OF CODE
            if (maxScore < 11) { alert('Game must reach 11 points to be complete'); return; }
            if (maxScore > 11 && scoreDifference !== 2) { alert('Game must be won by 2 points'); return; }
            onAddGame(match, score1, score2);
            (e.target as HTMLFormElement).reset();
          }}
          className="px-4 pb-4 pt-2 border-t border-[var(--border)] space-y-2"
        >
          <div className="flex gap-2">
            <input name="score1" type="number" min="0" max="50" required placeholder={getPlayerName(match.player1Id).substring(0, 10)}
              className="input flex-1 min-w-0 py-1.5 text-sm text-center score" />
            <span className="flex items-center text-dim font-bold text-sm">—</span>
            <input name="score2" type="number" min="0" max="50" required placeholder={getPlayerName(match.player2Id).substring(0, 10)}
              className="input flex-1 min-w-0 py-1.5 text-sm text-center score" />
          </div>
          <p className="text-xs text-dim text-center font-mono">First to 11 · win by 2</p>
          <button type="submit" className="btn btn-primary btn-sm w-full">
            Record Game
          </button>
        </form>
      )}

      {/* Games history */}
      {match.games.length > 0 && (
        <div className="px-4 pb-4 pt-2 border-t border-[var(--border)]">
          <p className="eyebrow mb-2">Games</p>
          <div className="space-y-1.5">
            {match.games.map(game => (
              <div key={game.id} className="flex items-center justify-between bg-[var(--bg-elevated)] rounded px-2 py-1.5 border border-[var(--border)]">
                {editingGame?.id === game.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input type="number" value={editScore1} onChange={e => setEditScore1(e.target.value)}
                      className="input w-14 py-0.5 text-sm text-center score px-1" />
                    <span className="text-dim text-xs">—</span>
                    <input type="number" value={editScore2} onChange={e => setEditScore2(e.target.value)}
                      className="input w-14 py-0.5 text-sm text-center score px-1" />
                    <button onClick={handleSaveGameEdit}
                      className="text-xs text-win font-semibold hover:underline ml-1">Save</button>
                    <button onClick={cancelEditingGame}
                      className="text-xs text-muted hover:underline">Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className={`text-sm font-semibold score ${game.score1 > game.score2 ? 'text-win' : 'text-loss'}`}>
                      {game.score1}–{game.score2}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => startEditingGame(game)}
                        className="text-dim hover:text-gold text-xs px-1 py-0.5 rounded transition-colors">edit</button>
                      <button onClick={() => onDeleteGame(game.id)}
                        className="text-dim hover:text-loss text-xs px-1 py-0.5 rounded transition-colors">del</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
