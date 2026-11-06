'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClub } from '../../../components/ClubProvider';
import { CLUB_ABOUT_MAX, CLUB_NAME_MAX } from '../../../lib/clubs';

type Stats = { activePlayers: number; tournaments: number; games: number };

/** The club's name, about text and headline numbers. Its admins can edit the text here. */
export function ClubDetails({ stats }: { stats: Stats | null }) {
  const { club, isAdmin } = useClub();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(club.name);
  const [about, setAbout] = useState(club.about ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEditing = () => {
    setName(club.name);
    setAbout(club.about ?? '');
    setError('');
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/club', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, about }) });
      if (res.ok) {
        setEditing(false);
        router.refresh(); // reloads the club from the server layout
      } else {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not save the club details.');
      }
    } catch {
      setError('Could not save the club details. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={save} className="surface-card space-y-4 p-6">
        <div>
          <label htmlFor="club-name" className="label-caps text-muted">Club name</label>
          <input
            id="club-name" required maxLength={CLUB_NAME_MAX} value={name}
            onChange={event => setName(event.target.value)}
            className="form-control mt-1 w-full rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="club-about" className="label-caps text-muted">About</label>
          <textarea
            id="club-about" rows={4} maxLength={CLUB_ABOUT_MAX} value={about}
            onChange={event => setAbout(event.target.value)}
            className="form-control mt-1 w-full rounded-lg px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-loss" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="button button-primary">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setEditing(false)} className="button button-secondary">Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <section className="surface-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-ink">{club.name}</h2>
          {club.about && <p className="mt-2 whitespace-pre-line text-ink-soft">{club.about}</p>}
        </div>
        {isAdmin && <button type="button" onClick={startEditing} className="button button-secondary shrink-0">Edit</button>}
      </div>
      {stats && (
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
          {[['Active players', stats.activePlayers], ['Tournaments', stats.tournaments], ['Games', stats.games]].map(([label, value]) => (
            <div key={label}>
              <dt className="label-caps text-muted">{label}</dt>
              <dd className="font-digits text-2xl text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
