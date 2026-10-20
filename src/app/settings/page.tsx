import { PageHeader } from '../../components/PageHeader';
import { ThemeToggle } from '../../components/ThemeToggle';
import { AuthControls } from '../../components/AuthProvider';

export default function SettingsPage() {
  return (
    <main className="app-shell">
      <div className="page-container page-container--narrow space-y-6">
        <PageHeader title="Settings" description="Appearance and admin access." />
        <section className="surface-card p-6">
          <p className="label-caps text-muted">Appearance</p>
          <div className="mt-2">
            <ThemeToggle />
          </div>
        </section>
        <section className="surface-card p-6">
          <p className="label-caps text-muted">Access</p>
          <div className="mt-2">
            <AuthControls />
          </div>
        </section>
      </div>
    </main>
  );
}
