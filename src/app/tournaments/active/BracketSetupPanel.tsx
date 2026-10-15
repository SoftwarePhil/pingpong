'use client';

import { PlayInMode } from '../../../types/pingpong';

interface BracketSetupPanelProps {
  firstRoundComplete: boolean;
  allRoundRobinComplete: boolean;
  thirdPlaceEnabled: boolean;
  onChangeThirdPlace: (enabled: boolean) => void;
  onApplyPlayInMode: (mode: PlayInMode) => void;
  onResetPreview: () => void;
  onStartBracket: () => void;
}

const PLAY_IN_OPTIONS: { mode: PlayInMode; label: string }[] = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'force', label: 'Add play-in' },
  { mode: 'none', label: 'Use byes instead' },
];

/** Admin controls for shaping the bracket preview before it starts. */
export function BracketSetupPanel({
  firstRoundComplete,
  allRoundRobinComplete,
  thirdPlaceEnabled,
  onChangeThirdPlace,
  onApplyPlayInMode,
  onResetPreview,
  onStartBracket,
}: BracketSetupPanelProps) {
  return (
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="label-caps text-muted">Bracket setup</p>
          <p className="mt-1 text-sm text-ink-soft">
            Click a match in the preview below to move players or choose who gets a bye. Nothing is saved until you start the bracket.
          </p>
        </div>
        <div className="text-right">
          <button
            type="button"
            onClick={onStartBracket}
            disabled={!firstRoundComplete}
            className="button button-accent px-5 py-2.5"
          >
            Start bracket
          </button>
          <p className="mt-1.5 text-xs text-muted">
            {!firstRoundComplete
              ? 'Available once round 1 is complete'
              : allRoundRobinComplete
              ? 'Every round so far is finished'
              : 'You can start now or keep playing rounds'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line pt-5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink">Play-in round</span>
          <div className="flex gap-1.5" role="group" aria-label="Play-in round">
            {PLAY_IN_OPTIONS.map(option => (
              <button
                key={option.mode}
                type="button"
                onClick={() => onApplyPlayInMode(option.mode)}
                className="button button-secondary button-sm"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={thirdPlaceEnabled}
            onChange={e => onChangeThirdPlace(e.target.checked)}
            className="h-4 w-4 accent-[var(--table)]"
          />
          Play a third-place game
        </label>
        <button type="button" onClick={onResetPreview} className="ml-auto text-sm font-semibold text-muted hover:text-ink">
          Reset preview
        </button>
      </div>
    </section>
  );
}
