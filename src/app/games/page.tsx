'use client';

import { useState, useEffect } from 'react';
import { Player, Game } from '../../types/pingpong';
import Link from 'next/link';

export default function GamesPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchPlayers();
    fetchGames();
  }, []);

  const fetchPlayers = async () => {
    const res = await fetch('/api/players');
    const data = await res.json();
    setPlayers(data);
  };

  const fetchGames = async () => {
    const res = await fetch('/api/games');
    const data = await res.json();
    setGames(data);
  };

  const addGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player1Id || !player2Id || !score1 || !score2) return;
    
    const score1Num = parseInt(score1);
    const score2Num = parseInt(score2);
    
    // Client-side validation for ping pong rules
    const maxScore = Math.max(score1Num, score2Num);
    const minScore = Math.min(score1Num, score2Num);
    const scoreDifference = Math.abs(maxScore - minScore);
    
    if (maxScore < 11) {
      console.log('Game must reach 11 points to be complete')
      alert('Game must reach 11 points to be complete');
      return;
    }
  else{
    if (maxScore > 11 && (scoreDifference !== 2)) {
      console.log('Game must be won by 2 points')
      alert('Game must be won by 2 points');
      return;
    }
  }
    
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player1Id,
        player2Id,
        score1: score1Num,
        score2: score2Num,
      }),
    });
    if (res.ok) {
      setPlayer1Id('');
      setPlayer2Id('');
      setScore1('');
      setScore2('');
      setShowAddForm(false);
      fetchGames();
    }
  };

  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player ? player.name : 'Unknown';
  };

  const getWinner = (game: Game) => {
    if (game.score1 > game.score2) return getPlayerName(game.player1Id);
    if (game.score2 > game.score1) return getPlayerName(game.player2Id);
    return 'Draw';
  };

  return (
    <div className="min-h-screen bg-page">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-ink mb-2">🎯 Games</h1>
            <p className="text-ink-muted">Record and view ping pong game results</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/" className="bg-overlay hover:bg-raised text-ink-dim px-4 py-2 rounded-lg border border-edge transition-colors">
              ← Back to Home
            </Link>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-brand hover:bg-brand-hi text-ink px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
            >
              <span>+</span>
              <span>Add Game</span>
            </button>
          </div>
        </div>

        {/* Add Game Form */}
        {showAddForm && (
          <div className="bg-surface rounded-xl p-6 mb-8 border border-edge">
            <h2 className="text-2xl font-bold text-ink mb-6">Record New Game</h2>
            <form onSubmit={addGame} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-ink-dim mb-2">Player 1</label>
                  <select 
                    value={player1Id} 
                    onChange={(e) => setPlayer1Id(e.target.value)} 
                    className="w-full border border-edge rounded-lg px-4 py-3 text-ink bg-overlay focus:ring-2 focus:ring-brand focus:border-brand-hi outline-none"
                    required
                  >
                    <option value="">Select Player 1</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-dim mb-2">Player 2</label>
                  <select 
                    value={player2Id} 
                    onChange={(e) => setPlayer2Id(e.target.value)} 
                    className="w-full border border-edge rounded-lg px-4 py-3 text-ink bg-overlay focus:ring-2 focus:ring-brand focus:border-brand-hi outline-none"
                    required
                  >
                    <option value="">Select Player 2</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-ink-dim mb-2">
                    {player1Id ? `${getPlayerName(player1Id)} Score` : 'Player 1 Score'}
                  </label>
                  <input
                    type="number"
                    value={score1}
                    onChange={(e) => setScore1(e.target.value)}
                    placeholder="Score"
                    className="w-full border border-edge rounded-lg px-4 py-3 text-ink bg-overlay placeholder-zinc-500 focus:ring-2 focus:ring-brand focus:border-brand-hi outline-none"
                    required
                    min="0"
                    max="12"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-dim mb-2">
                    {player2Id ? `${getPlayerName(player2Id)} Score` : 'Player 2 Score'}
                  </label>
                  <input
                    type="number"
                    value={score2}
                    onChange={(e) => setScore2(e.target.value)}
                    placeholder="Score"
                    className="w-full border border-edge rounded-lg px-4 py-3 text-ink bg-overlay placeholder-zinc-500 focus:ring-2 focus:ring-brand focus:border-brand-hi outline-none"
                    required
                    min="0"
                    max="12"
                  />
                </div>
              </div>

              <div className="text-center text-sm text-ink-faint mb-4">
                Games go to 11 points, win by 2 points
              </div>

              <div className="flex justify-end space-x-4">
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-2 border border-edge rounded-lg text-ink-dim hover:bg-overlay transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2 bg-brand hover:bg-brand-hi text-ink rounded-lg transition-colors"
                >
                  Record Game
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Games List */}
        <div className="space-y-4">
          {games.filter(game => !game.matchId).map((game) => (
            <div key={game.id} className="bg-surface rounded-xl p-6 border border-edge hover:border-edge-hi transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-ink text-lg font-bold ${
                      game.score1 > game.score2 ? 'bg-brand' : 'bg-raised'
                    }`}>
                      {getPlayerName(game.player1Id).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-ink">{getPlayerName(game.player1Id)}</div>
                      <div className="text-2xl font-bold text-ink-dim">{game.score1}</div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-ink-faint text-sm mb-1">VS</div>
                    <div className="text-sm text-ink-muted">
                      {new Date(game.date).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="font-bold text-ink">{getPlayerName(game.player2Id)}</div>
                      <div className="text-2xl font-bold text-ink-dim">{game.score2}</div>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-ink text-lg font-bold ${
                      game.score2 > game.score1 ? 'bg-brand' : 'bg-raised'
                    }`}>
                      {getPlayerName(game.player2Id).charAt(0).toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm text-ink-faint mb-1">Winner</div>
                  <div className="font-bold text-lg text-win">{getWinner(game)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {games.filter(game => !game.matchId).length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-ink mb-2">No games recorded yet</h3>
            <p className="text-ink-muted mb-6">Record your first game to get started!</p>
            <button 
              onClick={() => setShowAddForm(true)}
              className="bg-brand hover:bg-brand-hi text-ink px-8 py-3 rounded-lg transition-colors text-lg"
            >
              Record Game
            </button>
          </div>
        )}

        {/* Stats Card */}
        {games.filter(game => !game.matchId).length > 0 && (
          <div className="mt-8 bg-surface rounded-xl p-6 border border-edge">
            <h3 className="text-xl font-bold text-ink mb-4">Game Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-win mb-2">
                  {games.filter(game => !game.matchId).length}
                </div>
                <div className="text-ink-muted">Total Games</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-win mb-2">
                  {games.filter(game => !game.matchId && game.score1 !== game.score2).length}
                </div>
                <div className="text-ink-muted">Decisive Games</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gold mb-2">
                  {games.filter(game => !game.matchId && game.score1 === game.score2).length}
                </div>
                <div className="text-ink-muted">Draws</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-violet-400 mb-2">
                  {Math.round(games.filter(game => !game.matchId).reduce((sum, game) => sum + game.score1 + game.score2, 0) / games.filter(game => !game.matchId).length)}
                </div>
                <div className="text-ink-muted">Avg Points/Game</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
