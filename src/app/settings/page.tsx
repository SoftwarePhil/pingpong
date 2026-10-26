import { PageHeader } from '../../components/PageHeader';
import { ThemeToggle } from '../../components/ThemeToggle';
import { AuthControls } from '../../components/AuthProvider';
import { ExportDataSection } from './ExportDataSection';

export default function SettingsPage() {
  return (
    <main className="app-shell">
      <div className="page-container page-container--narrow space-y-6">
        <PageHeader title="Settings" description="Appearance, admin access and your data." />
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
        <ExportDataSection />
      </div>
    </main>
  );
}
