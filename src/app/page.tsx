/**
 * Bootstrap placeholder.
 *
 * The role-aware shell, navigation and capability model arrive with the foundation issue;
 * the three tools arrive with their own issues. This page exists so the scaffold, build and
 * browser harness are verifiable before any feature code is written. Replace it with the
 * real console home rather than growing it.
 */
export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Internal Tools</h1>
      <p className="mt-2 max-w-prose text-muted">
        Operations console for KYC review, refund operations and feature-flag administration.
        The repository is bootstrapped; no tool is implemented yet.
      </p>

      <section className="mt-8 rounded border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold">Next steps</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Foundation: shared shell, capability model, connector and repository contracts.</li>
          <li>KYC review queue, refund operations dashboard and feature-flag admin.</li>
          <li>Integration, then end-to-end security QA.</li>
        </ol>
        <p className="mt-3 text-muted">
          See <code className="font-mono">AGENTS.md</code> for the architecture and security
          rules that constrain all of the above.
        </p>
      </section>
    </main>
  );
}
