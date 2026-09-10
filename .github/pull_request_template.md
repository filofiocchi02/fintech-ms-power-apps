Closes #

## Summary

<!-- What changed and why. One or two sentences plus the notable decisions. -->

## Architecture and security notes

<!--
Answer explicitly:
- Which server-side app-access and action-permission checks cover the new pages/APIs?
- Which connector or repository owns each piece of data touched here?
- Did any external authoritative state (payments, KYC provider, flag values) get copied
  into SQLite? It must not have.
- Idempotency, financial invariants, workflow rules: where are they enforced?
- Which AuditEvent rows does an accepted mutation write, and what does a denied one write?
-->

## Checks run

<!-- Exact commands and their result. `npm run check` is mandatory. -->

- [ ] `npm run check` passes locally
- [ ] Migrations apply and the seed is still deterministic and idempotent

## Negative paths verified

<!--
List each forbidden request actually attempted and the observed result. Include the direct
URL/API calls, not just hidden-UI checks. Confirm no mutation happened and no success audit
was written.
-->

## Visual evidence

<!-- Screenshots or a short recording at 1280px, plus the 375px smoke check. -->

## Limitations

<!-- Known gaps, deferred P1 work, and anything a reviewer should not assume is covered. -->
