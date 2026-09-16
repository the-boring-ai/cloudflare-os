## Phase 2: Logging, approvals, caching, simulation, and observers

In this phase, we focus on responsibilities 4-7. These are typically added as a second pass, after the core gatekeeper works. They may be implemented in a separate session.

### Logging and approvals

Go through all the API methods and decide where to insert calls to the `ApprovalQueue`.

- Any operation which reads external data (but with no side effects) must call authorizeObservation().
- Any operation which has visible side effects on the world must call submitAction(), and must not actually apply the action until approved.

Study the `ApprovalQueue` API in `gatekeeper.ts` for details.

It's critically important that you add `ApprovalQueue` to all API operations that interact with the outside world, otherwise the gatekeeper security model is broken.

### Caching

Store fetched data in the gatekeeper's DO storage (`this.ctx.storage`) to avoid redundant API calls. The cache also enables a better API shape when the service's native data model is awkward — e.g., Gmail's list API returns thread IDs without metadata, but with caching the Session can return richer summaries directly.

- Use TTLs or revision IDs to keep the cache fresh.
- Cache transformed data (e.g., Markdown) rather than raw API responses when the transformation is expensive.

PROTIP: The relatively new API `this.ctx.storage.kv` provides synchronous versions of the traditional Durable Object storage API, e.g. `get` and `put`. Use these instead of the old asynchronous methods. (Note that the synchronous API does not provide "batch" versions of `get()` and `put()`, but you don't really need them since simply making multiple calls is efficient.)

PROTIP: `this.ctx.storage.sql` gives you access to a full, private SQLite database. Use this when the full power of SQL is useful, but prefer KV for simple things.

The full Durable Objects storage API (including synchronous KV and SQLite) is documented at: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/

### Simulation

When `submitAction()` has been called but `applyAction()` hasn't, reads should reflect the pending action. This allows the calling agent or gadget to be unaware of the approvals mechanism, and proceed with follow-on work immediately. The end user is able to approve a whole batch of changes at once, later on.

Two possible implementation approaches include:

1. **Mutate the cache** — Apply the action's effects to cached data on submit. On `rejectAction()`, invalidate or rebuild the cache. Simple; works well when the cache is already a transformed view. Don't forget to re-apply any queued actions when updating the cache.

2. **Overlay at read time** — Store pending actions separately; merge them into read results on demand. Cleaner separation; better when the overlay logic is straightforward.

Choose based on the service's data model and the complexity of simulating each action type.

Keep in mind that the agent calling the API (or the agent writing a gadget to call it) is generally not aware that actions do not take place immediately. If the simulation is correct, the agent doesn't need to be aware. If the simulation has gaps, you may want to mention it in your API's doc comments, so that the calling agent knows to work around them — but ideally there are no gaps and the calling agent does not need to think about it.

For concrete examples, see the Google gatekeeper's Google Docs simulation/cache handling and BigQuery dry-run scope enforcement.

### Observer verification

This is responsibility 7. When a Gadget is shared, each non-owner collaborator becomes an **observer** of every gatekeeper bound to the Gadget, and may see data the Gadget previously read. The gatekeeper's job is to refuse — or forward-restrict — observers who couldn't access that data themselves.

Three methods implement this (full JSDoc in `gatekeeper.ts`):

- `GatekeeperUser.getVerifier()` — mints a `GatekeeperUserVerifier` (a persistent service stub) representing *this* user's account. The overseer mints one per open and **only ever passes it back to a gatekeeper of the same vendor**, so the gatekeeper may trust whatever it learns from it.
- `Gatekeeper.addObserver(id, verifier)` — must **throw** if the user represented by `verifier` is not allowed to observe everything read through this gatekeeper so far. The overseer calls it on **every open by every authorized observer** (re-verification, so revoked access is caught at the next open); cache as needed if the check is expensive. `id` is an opaque, stable per-(user,gadget) string.
- `Gatekeeper.removeObserver(id)` — idempotent; drop a tracked observer.

#### The verifier "non-standard method" pattern

`GatekeeperUserVerifier` has no methods of its own — it's an opaque token. To actually answer "can this observer access X?", define a vendor-specific interface that **extends `GatekeeperUserVerifier`** with your own methods, implement it on a `WorkerEntrypoint` that queries the service using the **observer's own token**, and cast the `Fetcher` back to that interface inside `addObserver`. The overseer's same-vendor guarantee is what makes the cast safe.

```typescript
// In types/impl: a verifier interface with non-standard methods.
export interface MyVerifierApi extends GatekeeperUserVerifier {
  hasResourceAccess(resourceId: string): Promise<boolean>;
}

type MyVerifierProps = { userObjectId: string };

export class MyVerifier extends WorkerEntrypoint<Env, MyVerifierProps>
    implements MyVerifierApi {
  async hasResourceAccess(resourceId: string): Promise<boolean> {
    // Query the service with the OBSERVER's own token (this.ctx.props.userObjectId).
    try {
      await myApiForObserver(this.ctx).getResource(resourceId);
      return true;
    } catch (error) {
      // Distinguish "no access" from "transient failure":
      //   - auth/permission/not-found (401/403/404) → false (they can't see it)
      //   - anything else → rethrow, so the open fails loudly rather than silently denying
      if (isNoAccessStatus(statusOf(error))) return false;
      throw error;
    }
  }
}

// In GatekeeperUser:
async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
  return this.ctx.exports.MyVerifier({ props: { userObjectId: this.ctx.props.userObjectId } });
}
```

`MyVerifier` is a `WorkerEntrypoint`, so it needs **no migration entry**, but (like all entrypoints) it must be `export`ed from the worker's main module so `ctx.exports.MyVerifier(...)` resolves.

#### Choosing a strategy (per resource type / binding)

Strategy is chosen **per `Gatekeeper` DO class / binding**, not per package — one package may use several (e.g. Google: Gmail=A, Doc=B, BigQuery=C).

- **A — Private-only.** `addObserver()` always throws; `removeObserver()` is a no-op. `getVerifier()` must still exist (the overseer mints it) but is never consulted. Use when the resource is too sensitive to share and there is no per-observer access oracle (e.g. a personal Gmail mailbox).
- **B — ACL check (single unit).** The binding is one atomic resource; sub-resources inherit its ACL. `addObserver()` calls a verifier method to confirm the observer can access it and throws otherwise; `removeObserver()` is a no-op; nothing is tracked and no `excludeObservers` is ever needed. Use for repo / document / page / team / single-project bindings.
- **C — Data-set tracking.** The binding spans sub-resources with **distinct ACLs**, and there is a **per-observer access oracle** for each. The DO logs the data sets actually observed and the current observers; `addObserver()` verifies the observer against **every** logged set (plus a coarse membership baseline) and **stores their verifier**; each later observation that first touches a **new** set re-checks all stored observers and sets `excludeObservers` for any who fail. Use for workspace / organization / dataset-spanning bindings.
- **D — Low-stakes.** `addObserver()` / `removeObserver()` are no-ops; `getVerifier()` returns a trivial verifier with a no-op public method such as `verify(): void {}` (an empty `WorkerEntrypoint` is not registered in `ctx.exports`). Use when any collaborator may observe (personal, low-stakes services).

The **B-vs-C decision** (the "broad binding" lens): use C only when **both** (1) the binding spans sub-resources with distinct ACLs *and* (2) there's a per-observer oracle to check each against. If one ACL covers everything → B. If there's no oracle → A or D.

#### Implementing strategy C

Route **every data-revealing observation** through a helper that takes the set id(s) the observation reveals, instead of calling `authorizeObservation()` directly:

```typescript
// On the Gatekeeper DO. `setIds` are the data sets this observation reveals.
async authorizeSetObservation(
    queue: RpcStub<ApprovalQueue>, setIds: string[], description: ObservationDescription) {
  const check = setIds.length > 0
      ? await this.#prepareSetObservation(setIds)
      : { pendingSets: [], excludeObservers: undefined };
  await queue.authorizeObservation({ ...description, excludeObservers: check.excludeObservers });
  for (const setId of check.pendingSets) this.#markSetObserved(setId);
}

async #prepareSetObservation(setIds: string[]) {
  const pendingSets = [...new Set(setIds)].filter(id => !this.#isSetObserved(id));
  if (pendingSets.length === 0) return { pendingSets, excludeObservers: undefined };
  // This synchronous state change is visible to addObserver() before verifier RPCs can interleave.
  for (const setId of pendingSets) this.#markSetPendingIfUnknown(setId);
  const excluded = new Set<string>();
  for (const [id, verifier] of this.#listObservers()) {
    for (const setId of pendingSets) {
      if (!(await verifier.hasSetAccess(setId))) { excluded.add(id); break; }
    }
  }
  return {
    pendingSets,
    excludeObservers: excluded.size > 0 ? [...excluded] : undefined,
  };
}
```

Key points for C:

- **Use two durable states: pending and observed.** Mark unknown sets pending before the first await, recheck pending sets on every retry, and promote them only after `authorizeObservation()` succeeds. A failed authorization leaves them pending. `addObserver()` must check both states and loop until no unchecked sets remain before synchronously storing the verifier; this also closes admission races in either request ordering.
- **The session impls must route through this helper**, not `approvalQueue.authorizeObservation()`. If sessions hold the raw queue (not the DO), thread a small prepare hook/callback into each session and any sub-sessions it spawns, and expose a completion step that promotes its pending sets after authorization. For a single broad binding the hook is active; for the narrow (B) sibling binding it is absent (passthrough). See Linear/Notion for the shared-session-impl case and Supabase for the context-object case.
- **One observation may reveal several sets** (e.g. a workspace-wide list whose rows belong to different sub-resources). Pass all of them; union the exclusions over the newly-seen ones. Reads that reveal *no* set (workspace name, member directory, a bare "open") pass an empty list and rely on the membership baseline.
- **`addObserver` baseline:** verify the coarse membership (e.g. same org/workspace) that gates the set-independent reads, then verify each already-observed set, then store the verifier. Fail closed if a needed identity is unknown (e.g. an account connected before you began persisting the workspace id → force a reconnect).

#### `excludeObservers` semantics (why conservative is safe)

When `authorizeObservation()` is given `excludeObservers`, the overseer **blocks the observation** if any named observer is still authorized, and only lets it proceed (tearing down the observer) if they've already lost access. So erring toward listing an observer is never a leak — at worst it blocks an observation that could in principle have been allowed. The leak-relevant gate is always the live sharing graph, so stale observer state self-heals on the next open.
