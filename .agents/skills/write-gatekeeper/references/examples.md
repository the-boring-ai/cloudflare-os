## Reference implementations

- `packages/gatekeeper-google/` — OAuth, multiple resource types (Gmail, Google Docs, BigQuery), actions, caching/simulation examples, multiple Session types. **Observers:** all three strategies in one package — Gmail=A (always throw), Doc=B (single-unit ACL via `GoogleVerifier.hasDocAccess`), BigQuery=C (dataset tracking via `hasDatasetAccess`).
- `packages/gatekeeper-email/` — Hook-based push notifications, no actions, email address claiming. **Observers:** strategy D (low-stakes no-ops + trivial verifier).
- `packages/gatekeeper-github/` — **Observers:** clean strategy B example — `GitHubVerifier.hasRepoAccess` plus a one-method `addObserver`.
- `packages/gatekeeper-supabase/` — **Observers:** strategy C with a per-session context object (`authorizeProjectObservation`) — good when sessions already hold a shared context.
- `packages/gatekeeper-linear/` & `packages/gatekeeper-notion/` — **Observers:** strategy C where the page/team session impls are shared between the narrow (B) and broad (C) bindings, threading an `observe` hook through sub-sessions; both also handle one observation revealing multiple sets.
- `packages/workshop-shared/src/gatekeeper.ts` — Canonical interfaces with detailed JSDoc (`getVerifier`, `addObserver`, `removeObserver`, `GatekeeperUserVerifier`, `ObservationDescription.excludeObservers`).
