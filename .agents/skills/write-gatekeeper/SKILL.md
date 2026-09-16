---
name: write-gatekeeper
description: Implement or review a Cloudflare OS Gatekeeper integration, including resource capabilities, observations, and queued actions.
---

# Write a Gatekeeper

A Gatekeeper mediates an external service through Vendor, User, and per-resource Instance capabilities. Use the canonical interfaces and JSDoc in `packages/workshop-shared/src/gatekeeper.ts`.

## Authority and completion

- Read-only observations must await `authorizeObservation()` before returning data. Externally visible writes must go through `submitAction()` and cannot execute until `applyAction()` is called. Coding authorization does not bypass these runtime approval boundaries.
- Preserve resource-scoped grants, OAuth boundaries, observer access verification, and revocation. A gatekeeper cannot grant itself ambient authority.
- Complete the requested integration through auth, API, resource grants, approval logging, appropriate caching/simulation, observer protection, and relevant validation. A type-checking skeleton alone is not a finished gatekeeper.
- Make API choices reviewable and continue reversible implementation within the request. Ask only for a consequential unresolved product/authority decision or an explicitly requested review checkpoint; do not stop automatically between implementation phases.

## Read by task

- New integration or Session API: [implementation](references/implementation.md) and the relevant parts of [SKELETON.md](SKELETON.md).
- Observations, writes, caching, simulation, or sharing: [authorization and simulation](references/authorization-and-simulation.md). These protections are required before a complete integration can ship.
- Webhooks or persistent callbacks: [hooks](references/hooks.md).
- Stub lifetime, exports, migrations, or integration pitfalls: [integration](references/integration.md).
- Comparable service implementations: [examples](references/examples.md).

Read the sections required by the changed behavior. Inspect the result, fix in-scope failures, and retain existing deployment and credential authorization gates.
