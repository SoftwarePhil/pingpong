'use client';

import { FormEvent, useState } from 'react';
import { Game, Player, Tournament } from '../../../types/pingpong';
import { PlayerSearchSelect } from '../../../components/PlayerSearchSelect';

export type PairingStrategy = NonNullable<Tournament['rrPairingStrategy']>;

const STRATEGIES: { value: PairingStrategy; label: string; description: string }[] = [
  { value: 'swiss', label: 'Swiss', description: 'Similar records play, rematches avoided, byes rotate' },
  { value: 'top-vs-top', label: 'Top vs top', description: 'Top-ranked players face each other' },
  { value: 'random', label: 'Random', description: 'Players are paired randomly each round' },
];

interface EditTournamentPanelProps {
  tournament: Tournament;
  players: Player[];
  games: Game[];
  /** Roster and pairing changes are locked once the bracket has started. */
  rosterLocked: boolean;
  selectedPlayers: string[];
  onChangeSelectedPlayers: (ids: string[]) => void;
  pairingStrategy: PairingStrategy;
  savingPairingStrategy: boolean;
  onChangePairingStrategy: (strategy: PairingStrategy) => void;
  /** Creates a player and selects them; resolves to an error message, or null on success. */
  onCreatePlayer: (name: string) => Promise<string | null>;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}

export function EditTournamentPanel({
  tournament,
  players,
  games,
  rosterLocked,
  selectedPlayers,
  onChangeSelectedPlayers,
  pairingStrategy,
  savingPairingStrategy,
  onChangePairingStrategy,
  onCreatePlayer,
  onSubmit,
  onCancel,
}: EditTournamentPanelProps) {
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerError, setNewPlayerError] = useState<string | null>(null);

  const createPlayer = async () => {
    const name = newPlayerName.trim();
    if (!name) return;
    const error = await onCreatePlayer(name);
    if (error) { setNewPlayerError(error); return; }
    setNewPlayerName('');
    setNewPlayerError(null);
    setAddingPlayer(false);
  };

  return (
    <section className="surface-card p-6 sm:p-8">
      <p className="label-caps text-muted">Edit tournament</p>
      <h2 className="font-display mt-1 text-xl text-ink">{tournament.name}</h2>

      {rosterLocked && (
        <p className="mt-4 rounded-lg border border-ball/30 bg-ball-soft px-4 py-3 text-sm text-ink">
          <span className="font-semibold">The bracket has started.</span> Players and pairing can only change before the bracket.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-8">
        <fieldset>
          <legend className="label-caps text-muted">Round robin pairing</legend>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {STRATEGIES.map(option => {
              const selected = pairingStrategy === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={savingPairingStrategy || rosterLocked}
                  onClick={() => onChangePairingStrategy(option.value)}
                  className={`rounded-lg border-2 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected ? 'border-table bg-table-soft' : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  <span className={`block font-semibold ${selected ? 'text-table' : 'text-ink'}`}>{option.label}</span>
                  <span className="mt-1 block text-sm text-ink-soft">{option.description}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Changes apply right away to the current round&apos;s unplayed matches.</p>
        </fieldset>

        <PlayerSearchSelect players={players} games={games} selected={selectedPlayers} onChange={onChangeSelectedPlayers} />

        {addingPlayer ? (
          <div className="rounded-lg border border-line bg-surface-sunken p-4">
            <label htmlFor="new-player-name" className="text-sm font-semibold text-ink">New player</label>
            <div className="mt-2 flex gap-2">
              <input
                id="new-player-name"
                type="text"
                value={newPlayerName}
                onChange={e => { setNewPlayerName(e.target.value); setNewPlayerError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createPlayer(); } }}
                placeholder="Player name"
                autoFocus
                className="form-control flex-1 rounded-lg px-3 py-2 text-sm"
              />
              <button type="button" onClick={createPlayer} className="button button-primary">Add</button>
              <button type="button" onClick={() => { setAddingPlayer(false); setNewPlayerName(''); setNewPlayerError(null); }} className="button button-secondary">
                Cancel
              </button>
            </div>
            {newPlayerError && <p className="mt-2 text-sm text-loss">{newPlayerError}</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setAddingPlayer(true)} className="text-sm font-semibold text-table hover:underline">
            + Create a new player
          </button>
        )}

        <div className="flex justify-end gap-3 border-t border-line pt-6">
          <button type="button" onClick={onCancel} className="button button-secondary">Cancel</button>
          <button type="submit" className="button button-primary">Save players</button>
        </div>
      </form>
    </section>
  );
}
