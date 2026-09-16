# Admin Config

Code paths and commands are relative to the repository root. Apply only the sections relevant to the changed path.

Deployment admin settings (the `/admin` panel) follow a few conventions worth knowing when extending them:

* `packages/workshop-backend/src/admin-config.ts` defines `AdminConfig` — the deployment's "soft" customizations: agent instructions, banners/theme, and which gatekeeper connectors/resources are offered (plus the three-state mode for auto-provisioning gatekeepers, see `provisioning-policy.ts`). Connectors/resources default to enabled and the admin UI opts them *out*; auto-provisioning gatekeepers default to *optional*. **Authentication/authorization config (sign-in providers via `AUTH_GATEKEEPERS`, password login via `DISABLE_PASSWORD_AUTH`) is deliberately NOT here** — it stays env-var driven (`auth/config.ts`) so it can't be changed by a compromised admin session.
* The `AdminSettings` durable object owns the authoritative `AdminConfig` and mirrors it to a single reserved KV key (`.adminConfig`, see `isReservedBlueprintKey()`), so hot-path code (connect/agent) reads it with one cheap KV get via `readAdminConfig(env)`. The DO is the only writer (`updateAdminConfig(patch)`).
* Admin operations are exposed as an `AdminApi` capability obtained via `AuthenticatedApi.getAdminApi()` (returns null for non-admins). The `#isAdmin()` check happens once when the capability is minted, so the individual methods don't re-check.
* `user.ts:getGatekeeperClassFor()` is the single core chokepoint where disabled gatekeepers/resources are enforced before a capability is minted (gadget/agent code can't reach it directly).
