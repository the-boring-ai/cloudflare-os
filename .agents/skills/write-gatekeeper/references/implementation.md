## Core implementation

Build the requested integration with the authorization and observer protections in the linked contract. The examples are scaffolding, not a production completion gate.

### Step 1: Understand the external service

Study the service's API docs. Identify:
- Auth model (OAuth 2.0, API keys, etc.)
- Resources to expose and what access granularities make sense
- Which operations are observations (read-only) vs. actions (side effects)

### Step 2: Design the Session types

Create `src/types.d.ts` defining the Session interface (and Hook interface if the service pushes events — see [Hooks](hooks.md#hooks-push-notifications)).

Before designing, read `packages/workshop-shared/node_modules/capnweb/README.md` to understand what Cap'n Web RPC supports — this determines what types and patterns are expressible in the Session interface.

Design principles:
- One interface per logical resource type, not a god-object
- Methods return structured data, not raw API responses
- Use capability-based design principles: make it easy to limit authority in useful ways by simply limiting access to specific objects or allowing/blocking specific methods
- Simplify API complexities that are not likely to matter to agents and gadgets; design for a more novice user and common use cases
- Consider what URL patterns `getGatekeeperClassFor()` should match — each pattern maps to a resource granularity
- Include JSDoc comments; these types serve as the agent's API documentation. See [Documenting the API](#documenting-the-api-typesdts) below.

#### Documenting the API (`types.d.ts`)

This JSDoc is the agent's sole documentation for the API, so keep it **narrowly focused on what the agent needs to use each method**: what it does, its parameters, the returned data shape, and any errors the caller must handle.

Do NOT leak details the caller doesn't need to use the API — the approval queue (never mention `submitAction`/`applyAction`/approvals; correct simulation keeps this invisible), or gatekeeper internals (caching, DO storage, OAuth, syncing). Document those in the `.ts` implementation or PR, never in the agent-facing `.d.ts`.

### API decisions

Make the proposed resource API and trade-offs reviewable in `types.d.ts`. Continue reversible implementation when the requested scope is clear. Pause only when the user requested an API approval checkpoint or a consequential authority/product decision remains unresolved. Keep internal approval machinery out of agent-facing JSDoc.


### Step 4: Implement

See [SKELETON.md](../SKELETON.md) for a complete implementation template.

Package structure:
```
packages/gatekeeper-<name>/
├── src/
│   ├── configurator/         # Optional resource-picker UI modules and UI-facing types
│   ├── <name>.ts              # Vendor, UserAccount, UserImpl, GatekeeperImpl, SessionImpl
│   ├── types.d.ts             # Session/Hook types (compile-time)
│   ├── types.txt -> types.d.ts  # Symlink (runtime, for getTypeScriptTypes())
│   └── <name>-api.ts          # (optional) Helper wrapping the service's HTTP API
├── wrangler.jsonc
├── package.json
└── tsconfig.json
```

### Step 5: Configure and register

Add a service binding to `packages/workshop-backend/wrangler.jsonc`:
```jsonc
{
  "binding": "GATEKEEPER_<NAME>",
  "service": "gatekeeper-<name>",
  "entrypoint": "GatekeeperVendor"
}
```

The backend auto-discovers vendors from `GATEKEEPER_`-prefixed bindings (see `packages/workshop-backend/src/user.ts`).

### Step 6: Add resource selection UI

Add a resource selection UI for each resource type returned in `getSupportedResources()`. This will be used by users to select the specific resource.

- Workshop calls `GatekeeperUser.startResourceConfigurator(resourceUrlPattern)` with the selected resource's `urlPattern`.
- Return `iframeHtml` of the selection UI and `ui` for any RPCs that UI needs.
- When the user selects "Add connection", Workshop asks the iframe for the selected resource URL.

Keep the iframe-facing capability narrow, only what's necessary to provide desired interface to help user find and select the resource.

#### Optional helper: `@gadgets/configurator-ui`

For simple configuration UIs, consider using `@gadgets/configurator-ui`. It provides the basic form components that look consistent to the Gadget Workshop and a build script that turns `src/configurator/*-ui.tsx` into `iframeHtml`. Gatekeepers with more specialized UI needs can produce their own `iframeHtml`.

If you use this:

- UI modules live in `src/configurator/*-ui.tsx`.
- `resourceUrl()` returns the selected resource URL.
- `src/configurator/*-types.d.ts` describes the iframe-facing `ui` API.
- `scripts/build-gatekeeper-configurator.mjs` generates `src/generated/*.txt`.
- Package `build` / `deploy` scripts run the builder directly
  (`node ../../scripts/build-gatekeeper-configurator.mjs .`), and `vite.config.ts` re-exports the
  shared `build:configurator` Vite+ task from `scripts/gatekeeper-configurator-vite-config.js` so
  the dev-server pre-flight caches it with `VITE_FRONTEND_ERROR_REPORTING` in the fingerprint.

##### Pre-filling the form from a known resource URL

When something already knows the exact resource — most importantly an AI agent's `requestConnection` (which passes a concrete `resourceUrl`) — the configurator should open **pre-filled and editable**, not blank. The runtime handles this for you:

- If your value keys already match the `urlPattern`'s named groups (e.g. pattern `.../area/:areaId` with a value key `areaId`), prefill works automatically — no code needed.
- Otherwise, implement the optional `initialValuesFromResourceUrl({ resourceUrl, resourceUrlPattern, ui })` on your spec to map a concrete URL back to your form values. Keep it pure where possible (parse the URL); it may use `ui` and may be async. Example (GitHub, whose value is `repoFullName` but pattern is `:owner/:repo`):

  ```ts
  initialValuesFromResourceUrl({ resourceUrl }) {
    const [owner, repo] = new URL(resourceUrl).pathname.split("/").filter(Boolean);
    return owner && repo ? { repoFullName: `${owner}/${repo}` } : {};
  },
  ```

  The runtime seeds these values before first render and reflects them in `Autocomplete`/`TextInput`/`RadioCards` inputs. Make sure your `resourceUrl(values)` and `initialValuesFromResourceUrl(url)` are inverses so a prefilled form round-trips to the same URL. **Every gatekeeper with selectable resources should support this** so agents can fully pre-configure a connection.

### Complete the integration

A complete gatekeeper includes observation/action authorization and observer protection. Continue through the required security and simulation work; stop at a scaffold only when the user explicitly requested a scaffold. Never present minimal stubs as production-ready authorization.
