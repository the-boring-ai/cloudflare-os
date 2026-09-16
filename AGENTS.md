# Cloudflare OS kernel

Sandboxed personal applications and agents. Use `pnpm` and the checkout's pinned tooling.

## Working scope

Carry the requested work through implementation, relevant validation, and inspection of the result. Fix failures caused by the change and continue already-authorized review or release steps without asking for the same permission again. A first patch or passing build is not completion when the requested user flow still fails.

Read only the documentation and skills relevant to the task. Run checks that cover the changed behavior; repeat successful checks only after a relevant change, failure, or unresolved concern, while satisfying required CI. Preserve unrelated work and existing authorization boundaries. If information or authority is missing, name the concrete blocker and continue independent work.

## Non-obvious contracts

- Keep kernel and shared API diffs small and review every changed backend/API line. Document every exported shared API member. Derive RPC types from the actual interfaces instead of maintaining mirrors and casting through `unknown`.
- A gatekeeper cannot grant itself ambient authority. User/admin configuration owns capability grants. Preserve observation authorization, queued actions, observer verification, and tenant/sharing-domain isolation.
- RPC stubs are callable: wrap them in an object before storing in React state and dispose them when no longer needed. Use Cap'n Web promise pipelining where appropriate; see [RPC](.agents/references/rpc.md).
- Do not put secrets, prompts, tokens, headers, or request/response bodies in logging or reporting. Diagnostic frontend metadata never conveys identity or authority.

## Task references

- For package boundaries, gatekeepers, or routing: [architecture](.agents/references/architecture.md).
- For admin configuration/capability changes: [admin configuration](.agents/references/admin-config.md).
- For gatekeeper implementation: [write-gatekeeper](.agents/skills/write-gatekeeper/SKILL.md).
- For tests, type checks, code generation, or build caching: [validation](.agents/references/validation.md). Use the relevant package checks and required CI; do not remove runtime test guards to obtain a pass.
- For server observability: [logging](.agents/references/logging.md). For browser or embedded-frame reporting: [frontend reporting](.agents/references/frontend-reporting.md).
- Before release changes or promotion: [release](.agents/references/release.md). Preserve verified-candidate promotion, immutable blueprint identities, and serialized manifest publication.
