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
    <div className="bg-surface border border-edge rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex justify-between items-center px-4 py-2 bg-overlay border-b border-edge">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
          {match.round === 'bracket'
            ? match.bracketRound === 0 ? 'Play-in' : `Round ${match.bracketRound}`
            : `RR Round ${match.bracketRound ?? 1}`}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs bg-raised text-ink-dim px-2 py-0.5 rounded-full">
            Bo{match.bestOf}
          </span>
          {canSwap && (
            <button
              onClick={() => { setSwapping(!swapping); setSwapP1(match.player1Id); setSwapP2(match.player2Id); }}
              className="text-ink-muted hover:text-ink-dim px-1.5 py-0.5 rounded hover:bg-raised text-xs transition-colors"
              title="Change players"
            >
              ↔
            </button>
          )}
          <button
            onClick={() => onDeleteMatch(match.id)}
            className="text-loss hover:text-loss px-1.5 py-0.5 rounded hover:bg-raised text-xs transition-colors"
            title="Delete match"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Player swap panel */}
      {swapping && (
        <div className="px-4 py-3 bg-overlay border-b border-edge">
          <p className="text-xs font-semibold text-ink-dim mb-2">Change Players</p>
          <div className="space-y-1.5">
            <select value={swapP1} onChange={e => setSwapP1(e.target.value)}
              className="w-full border border-edge rounded px-2 py-1 text-sm text-ink bg-raised">
              {tournamentPlayers.map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="text-center text-xs text-ink-faint font-bold">vs</div>
            <select value={swapP2} onChange={e => setSwapP2(e.target.value)}
              className="w-full border border-edge rounded px-2 py-1 text-sm text-ink bg-raised">
              {tournamentPlayers.map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSwapSave}
                className="flex-1 bg-brand hover:bg-brand-hi text-ink text-xs px-2 py-1.5 rounded font-medium transition-colors">
                Save
              </button>
              <button onClick={() => setSwapping(false)}
                className="flex-1 bg-raised hover:bg-raised text-ink-dim text-xs px-2 py-1.5 rounded font-medium transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Players */}
      <div className="px-4 py-3 space-y-2">
        <div className={`flex justify-between items-center px-3 py-2 rounded-lg border ${
          match.winnerId === match.player1Id
            ? 'bg-brand-dim border-brand-bd text-win'
            : 'bg-overlay border-edge text-ink-dim'
        }`}>
          <span className="font-medium truncate mr-2 text-sm" title={getPlayerName(match.player1Id)}>
            {getPlayerName(match.player1Id)}
          </span>
          <span className="text-xs font-bold flex-shrink-0 tabular-nums">
            {match.games.filter(g => g.score1 > g.score2).length}W
          </span>
        </div>

        <div className="text-center text-xs text-ink-faint font-semibold">
          {match.player2Id === 'BYE' ? 'BYE' : 'VS'}
        </div>

        {match.player2Id !== 'BYE' && (
          <div className={`flex justify-between items-center px-3 py-2 rounded-lg border ${
            match.winnerId === match.player2Id
              ? 'bg-brand-dim border-brand-bd text-win'
              : 'bg-overlay border-edge text-ink-dim'
          }`}>
            <span className="font-medium truncate mr-2 text-sm" title={getPlayerName(match.player2Id)}>
              {getPlayerName(match.player2Id)}
            </span>
            <span className="text-xs font-bold flex-shrink-0 tabular-nums">
              {match.games.filter(g => g.score2 > g.score1).length}W
            </span>
          </div>
        )}
      </div>

      {/* Winner badge */}
      {match.winnerId && (
        <div className="px-4 pb-3 text-center">
          <span className="inline-block bg-gold-dim text-gold border border-gold-bd px-3 py-1 rounded-full text-xs font-bold">
            🏆 {getPlayerName(match.winnerId)}
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
          className="px-4 pb-4 pt-2 border-t border-edge space-y-2"
        >
          <div className="flex gap-2">
            <input name="score1" type="number" min="0" max="50" required placeholder={getPlayerName(match.player1Id).substring(0, 10)}
              className="flex-1 min-w-0 border border-edge rounded-lg px-2 py-1.5 text-sm text-ink bg-overlay placeholder-zinc-500 focus:border-brand-hi focus:outline-none focus:ring-1 focus:ring-brand" />
            <span className="flex items-center text-ink-faint font-bold text-sm">—</span>
            <input name="score2" type="number" min="0" max="50" required placeholder={getPlayerName(match.player2Id).substring(0, 10)}
              className="flex-1 min-w-0 border border-edge rounded-lg px-2 py-1.5 text-sm text-ink bg-overlay placeholder-zinc-500 focus:border-brand-hi focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <p className="text-xs text-ink-faint text-center">First to 11, win by 2</p>
          <button type="submit"
            className="w-full bg-brand hover:bg-brand-hi text-ink text-sm py-2 rounded-lg font-semibold transition-colors">
            Record Game
          </button>
        </form>
      )}

      {/* Games history */}
      {match.games.length > 0 && (
        <div className="px-4 pb-4 pt-2 border-t border-edge">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Games</p>
          <div className="space-y-1.5">
            {match.games.map(game => (
              <div key={game.id} className="flex items-center justify-between bg-overlay rounded-lg px-2 py-1.5 border border-edge">
                {editingGame?.id === game.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input type="number" value={editScore1} onChange={e => setEditScore1(e.target.value)}
                      className="w-14 border border-edge rounded px-1.5 py-0.5 text-sm text-center text-ink bg-raised" />
                    <span className="text-ink-faint text-xs">—</span>
                    <input type="number" value={editScore2} onChange={e => setEditScore2(e.target.value)}
                      className="w-14 border border-edge rounded px-1.5 py-0.5 text-sm text-center text-ink bg-raised" />
                    <button onClick={handleSaveGameEdit}
                      className="text-xs text-win font-semibold hover:underline ml-1">Save</button>
                    <button onClick={cancelEditingGame}
                      className="text-xs text-ink-faint hover:underline">Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className={`text-sm font-semibold tabular-nums ${game.score1 > game.score2 ? 'text-win' : 'text-loss'}`}>
                      {game.score1}–{game.score2}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => startEditingGame(game)}
                        className="text-ink-faint hover:text-ink-dim text-xs px-1 py-0.5 rounded hover:bg-raised">✏️</button>
                      <button onClick={() => onDeleteGame(game.id)}
                        className="text-loss hover:text-loss text-xs px-1 py-0.5 rounded hover:bg-raised">🗑️</button>
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
