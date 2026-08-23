'use client';

import { useMemo, useState } from 'react';
import { Player, Game } from '../types/pingpong';
import { getGamePlayerIds } from '../lib/matchFormat';

interface PlayerSearchSelectProps {
  players: Player[];
  games: Game[];
  selected: string[];
  onChange: (ids: string[]) => void;
  suggestionCount?: number;
}

/**
 * Search-driven player picker. Lets you type to filter the full player list,
 * and also surfaces a handful of "most active" suggestions (by games played)
 * so the common case of picking regulars doesn't require typing at all.
 * Once a suggested player is added, the next-most-active player takes its place.
 */
export function PlayerSearchSelect({ players, games, selected, onChange, suggestionCount = 5 }: PlayerSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const gamesPlayedById = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach(g => {
      getGamePlayerIds(g).forEach(playerId => {
        counts[playerId] = (counts[playerId] ?? 0) + 1;
      });
    });
    return counts;
  }, [games]);

  const availablePlayers = players.filter(p => !selected.includes(p.id));

  const suggestions = useMemo(() => {
    return [...availablePlayers]
      .sort((a, b) => (gamesPlayedById[b.id] ?? 0) - (gamesPlayedById[a.id] ?? 0) || a.name.localeCompare(b.name))
      .slice(0, suggestionCount);
  }, [availablePlayers, gamesPlayedById, suggestionCount]);

  const allSorted = useMemo(() => {
    return [...availablePlayers].sort((a, b) => a.name.localeCompare(b.name));
  }, [availablePlayers]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return availablePlayers.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [availablePlayers, query]);

  const selectedPlayers = selected
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));

  const addPlayer = (id: string) => {
    onChange([...selected, id]);
    setQuery('');
  };

  const removePlayer = (id: string) => {
    onChange(selected.filter(sid => sid !== id));
  };

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="🔍 Search players to add..."
          className="form-control w-full rounded-lg px-4 py-3 text-lg"
        />
        {query && (
          <div className="absolute z-10 mt-2 w-full bg-white border-2 border-blue-300 rounded-lg shadow-lg overflow-hidden">
            {searchResults.length > 0 ? (
              searchResults.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addPlayer(p.id)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors text-gray-900 font-medium border-b border-gray-100 last:border-b-0"
                >
                  {p.name}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-gray-500">No matching players</div>
            )}
          </div>
        )}
      </div>

      {!query && suggestions.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {showAll ? 'All Players' : 'Most Active'}
            </p>
            {!showAll && availablePlayers.length > suggestions.length && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Show all players
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(showAll ? allSorted : suggestions).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => addPlayer(p.id)}
                className="flex items-center gap-1.5 bg-gray-50 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 text-gray-800 rounded-full pl-3 pr-3 py-1.5 text-sm font-medium transition-colors"
              >
                <span className="text-blue-600">+</span> {p.name}
                {gamesPlayedById[p.id] > 0 && (
                  <span className="text-gray-400 text-xs">({gamesPlayedById[p.id]})</span>
                )}
              </button>
            ))}
          </div>
          {showAll && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors mt-2"
            >
              Show fewer
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {selectedPlayers.length === 0 && (
          <p className="text-gray-500 text-sm py-1">No players selected yet — search or pick a suggestion above.</p>
        )}
        {selectedPlayers.map(p => (
          <span
            key={p.id}
            className="flex items-center gap-2 bg-blue-50 border-2 border-blue-200 text-gray-900 rounded-full pl-4 pr-2 py-2 font-medium"
          >
            {p.name}
            <button
              type="button"
              onClick={() => removePlayer(p.id)}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 text-sm transition-colors"
              aria-label={`Remove ${p.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
