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
    <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {match.round === 'bracket'
            ? match.bracketRound === 0 ? 'Play-in' : `Round ${match.bracketRound}`
            : `RR Round ${match.bracketRound ?? 1}`}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
            Bo{match.bestOf}
          </span>
          {canSwap && (
            <button
              onClick={() => { setSwapping(!swapping); setSwapP1(match.player1Id); setSwapP2(match.player2Id); }}
              className="text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 text-xs transition-colors"
              title="Change players"
            >
              ↔
            </button>
          )}
          <button
            onClick={() => onDeleteMatch(match.id)}
            className="text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 text-xs transition-colors"
            title="Delete match"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Player swap panel */}
      {swapping && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
          <p className="text-xs font-semibold text-blue-700 mb-2">Change Players</p>
          <div className="space-y-1.5">
            <select value={swapP1} onChange={e => setSwapP1(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white">
              {tournamentPlayers.map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="text-center text-xs text-gray-400 font-bold">vs</div>
            <select value={swapP2} onChange={e => setSwapP2(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white">
              {tournamentPlayers.map(pid => (
                <option key={pid} value={pid}>{getPlayerName(pid)}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSwapSave}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1.5 rounded font-medium transition-colors">
                Save
              </button>
              <button onClick={() => setSwapping(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-2 py-1.5 rounded font-medium transition-colors">
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
            ? 'bg-green-50 border-green-300 text-green-900'
            : 'bg-gray-50 border-gray-200 text-gray-900'
        }`}>
          <span className="font-medium truncate mr-2 text-sm" title={getPlayerName(match.player1Id)}>
            {getPlayerName(match.player1Id)}
          </span>
          <span className="text-xs font-bold flex-shrink-0 tabular-nums">
            {match.games.filter(g => g.score1 > g.score2).length}W
          </span>
        </div>

        <div className="text-center text-xs text-gray-400 font-semibold">
          {match.player2Id === 'BYE' ? 'BYE' : 'VS'}
        </div>

        {match.player2Id !== 'BYE' && (
          <div className={`flex justify-between items-center px-3 py-2 rounded-lg border ${
            match.winnerId === match.player2Id
              ? 'bg-green-50 border-green-300 text-green-900'
              : 'bg-gray-50 border-gray-200 text-gray-900'
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
          <span className="inline-block bg-amber-100 text-amber-800 border border-amber-300 px-3 py-1 rounded-full text-xs font-bold">
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
          className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2"
        >
          <div className="flex gap-2">
            <input name="score1" type="number" min="0" max="50" required placeholder={getPlayerName(match.player1Id).substring(0, 10)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <span className="flex items-center text-gray-400 font-bold text-sm">—</span>
            <input name="score2" type="number" min="0" max="50" required placeholder={getPlayerName(match.player2Id).substring(0, 10)}
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <p className="text-xs text-gray-400 text-center">First to 11, win by 2</p>
          <button type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2 rounded-lg font-semibold transition-colors">
            Record Game
          </button>
        </form>
      )}

      {/* Games history */}
      {match.games.length > 0 && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Games</p>
          <div className="space-y-1.5">
            {match.games.map(game => (
              <div key={game.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-200">
                {editingGame?.id === game.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input type="number" value={editScore1} onChange={e => setEditScore1(e.target.value)}
                      className="w-14 border rounded px-1.5 py-0.5 text-sm text-center" />
                    <span className="text-gray-400 text-xs">—</span>
                    <input type="number" value={editScore2} onChange={e => setEditScore2(e.target.value)}
                      className="w-14 border rounded px-1.5 py-0.5 text-sm text-center" />
                    <button onClick={handleSaveGameEdit}
                      className="text-xs text-green-700 font-semibold hover:underline ml-1">Save</button>
                    <button onClick={cancelEditingGame}
                      className="text-xs text-gray-500 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className={`text-sm font-semibold tabular-nums ${game.score1 > game.score2 ? 'text-green-700' : 'text-red-600'}`}>
                      {game.score1}–{game.score2}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => startEditingGame(game)}
                        className="text-blue-400 hover:text-blue-600 text-xs px-1 py-0.5 rounded hover:bg-blue-50">✏️</button>
                      <button onClick={() => onDeleteGame(game.id)}
                        className="text-red-400 hover:text-red-600 text-xs px-1 py-0.5 rounded hover:bg-red-50">🗑️</button>
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
