import { AppShell } from '@/components/internal-tools/AppShell';
import { PageHeader } from '@/components/internal-tools/PageHeader';

/**
 * Console home. No tool state here — this page is the launch pad and a compile-safe anchor
 * for the shared shell. Each tool gets its own route under /kyc, /refunds, /flags and /audit.
 */
export default async function HomePage() {
  return (
    <AppShell activeApp="platform">
      <PageHeader
        title="Operations Console"
        description="Select a tool from the navigation. Your available tools depend on the acting role."
      />
      <section className="rounded border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold">Getting started</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Use the role switcher in the header to act as Support, Compliance, Release Engineer or Manager/Admin.</li>
          <li>Each role sees only the apps it is authorised to open.</li>
          <li>Direct navigation or API calls to forbidden apps are blocked server-side.</li>
        </ol>
      </section>
    </AppShell>
  );
}
