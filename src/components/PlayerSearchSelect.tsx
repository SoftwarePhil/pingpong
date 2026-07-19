'use client';

import { useMemo, useState } from 'react';
import { Player, Game } from '../types/pingpong';

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
      if (g.player1Id) counts[g.player1Id] = (counts[g.player1Id] ?? 0) + 1;
      if (g.player2Id) counts[g.player2Id] = (counts[g.player2Id] ?? 0) + 1;
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
          placeholder="Search players to add…"
          className="input"
        />
        {query && (
          <div className="absolute z-10 mt-2 w-full panel-raised overflow-hidden shadow-2xl">
            {searchResults.length > 0 ? (
              searchResults.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addPlayer(p.id)}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-[rgba(232,184,74,0.08)] transition-colors border-b border-[var(--border)] last:border-0 flex items-center gap-3"
                >
                  <span className="avatar avatar-sm">{p.name.charAt(0).toUpperCase()}</span>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-dim text-xs ml-auto font-mono">{gamesPlayedById[p.id] ?? 0}g</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-muted">No matches for &quot;{query}&quot;</div>
            )}
          </div>
        )}
      </div>

      {selectedPlayers.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {selectedPlayers.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => removePlayer(p.id)}
              className="chip chip-active gap-2"
              title="Remove"
            >
              {p.name}
              <span className="opacity-60">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-dim font-mono tracking-wider uppercase">
            {query ? 'Search results above' : 'Suggestions'}
          </p>
          {!query && availablePlayers.length > suggestionCount && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-gold hover:underline font-medium"
            >
              {showAll ? 'Show less' : `All ${availablePlayers.length}`}
            </button>
          )}
        </div>
        {!query && (
          <div className="flex flex-wrap gap-2">
            {(showAll ? allSorted : suggestions).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => addPlayer(p.id)}
                className="chip hover:border-[var(--border-gold)] hover:text-gold"
              >
                + {p.name}
              </button>
            ))}
            {availablePlayers.length === 0 && selectedPlayers.length > 0 && (
              <span className="text-xs text-dim">Everyone is selected</span>
            )}
          </div>
        )}
      </div>

      {selectedPlayers.length > 0 && (
        <p className="mt-3 text-xs text-dim font-mono">
          {selectedPlayers.length} selected
        </p>
      )}
    </div>
  );
}
