'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useConfirm } from '../../components/ConfirmDialog';
import type { Admin, AdminRole } from '../../types/pingpong';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Owner-only: the club's admins, with adding and removing. */
export function AdminsSection() {
  const { admin: me, isOwner } = useAuth();
  const confirm = useConfirm();
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ name: string; email: string; role: AdminRole }>({ name: '', email: '', role: 'admin' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admins', { cache: 'no-store' });
    if (res.ok) setAdmins(await res.json());
    else setError('Could not load admins.');
  }, []);

  useEffect(() => { if (isOwner) load(); }, [isOwner, load]);

  if (!isOwner) return null;

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not add the admin.');
      return;
    }
    setForm({ name: '', email: '', role: 'admin' });
    await load();
  };

  const remove = async (admin: Admin) => {
    const ok = await confirm({
      title: `Remove ${admin.name}?`,
      message: `${admin.email} will be signed out and can't sign in again unless an owner adds them back.`,
      confirmLabel: 'Remove admin',
      tone: 'danger',
    });
    if (!ok) return;
    setError('');
    const res = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Could not remove the admin.');
    await load();
  };

  return (
    <section className="surface-card p-6">
      <p className="label-caps text-muted">Admins</p>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        Admins run tournaments and edit players. Owners can also add and remove admins. Everyone signs in with a link emailed to them.
      </p>

      {admins && (
        <ul className="mt-4 divide-y divide-line">
          {admins.map(admin => (
            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {admin.name}{admin.id === me?.id ? ' (you)' : ''}
                  <span className="label-caps ml-2 text-muted">{admin.role}</span>
                </p>
                <p className="truncate text-sm text-ink-soft">
                  {admin.email} · {admin.lastSignInAt ? `last signed in ${formatDate(admin.lastSignInAt)}` : 'not signed in yet'}
                </p>
              </div>
              {admin.id !== me?.id && (
                <button type="button" onClick={() => remove(admin)} className="button button-secondary button-danger">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} noValidate className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <label className="text-sm">
          <span className="auth-controls__label">Name</span>
          <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="form-control w-full rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="auth-controls__label">Email</span>
          <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="form-control w-full rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="auth-controls__label">Role</span>
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as AdminRole })} className="form-control w-full rounded-lg px-2 py-1.5 text-sm">
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button type="submit" disabled={saving} className="button button-primary">{saving ? 'Adding…' : 'Add admin'}</button>
      </form>
      {error && <p className="mt-3 text-sm text-loss" role="alert">{error}</p>}
    </section>
  );
}
