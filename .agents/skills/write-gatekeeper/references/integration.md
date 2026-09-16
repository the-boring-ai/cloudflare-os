## Tips

- `types.txt` must be a **symlink** to `types.d.ts`, never a copy.
- Call `.dup()` on `approvalQueue` stubs before storing in a session, since Cap'n Web automatically disposes all stubs in parameters to an RPC call when the call returns.
- `suggestedBindingName` in `describe()` reflects the resource **type** (e.g. `"GMAIL_INBOX"`), not the specific instance.
- For read-only or push-only gatekeepers, `applyAction()` / `rejectAction()` / `revertAction()` can simply throw (they'll never be called since the gatekeeper never submits actions).
- For `WorkerEntrypoint` and `DurableObject` subclasses, pass credentials and resource IDs via `ctx.props`, not constructor arguments. RPC stubs pointing to these types can be stored in long-term storage and restored later, creating a new instance based on the same `props`.
- If the gatekeeper implements multiple unrelated resource types with disjoint APIs, each may have its own `.d.ts` file, so that the `getTypeScriptTypes()` method of the specific `Gatekeeper` implementation only returns the types that matter for it. The `getTypeScriptTypes()` method on the top-level `GatekeeperVendor` should return the concatenation of all of these.
- All DO classes must appear in `wrangler.jsonc` under `migrations[].new_sqlite_classes`.
- Set a self-destruct alarm in `UserAccount.setCallback()` in case the OAuth flow is never completed.
- `authorizeObservation()` may be called *after* fetching data (so the description can include details about what was fetched) but must be awaited *before* returning anything to the caller.
- `getVerifier()` / `addObserver()` / `removeObserver()` are **mandatory** — the gatekeeper won't type-check without them. Even a read-only or push-only gatekeeper needs them (sharing is independent of whether the gatekeeper has actions). Pick a strategy per [Observers](authorization-and-simulation.md#observer-verification): a low-stakes one can be A or D; otherwise B/C.
