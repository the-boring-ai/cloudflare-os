# Frontend Reporting

Code paths and commands are relative to the repository root. Apply only the sections relevant to the changed path.

IMPORTANT: Frontend error reporting is a separate, opt-in path:
- `@gadgets/error-reporting` owns the vendor-neutral browser/Worker event contract and tolerant,
  bounded normalization. `VITE_FRONTEND_ERROR_REPORTING=true` enables trusted frontend producers
  and their hidden source maps at build time; deployments without reporting should leave it unset.
- The Workshop browser sends best-effort reports to the same-origin `POST /api/client-errors`
  endpoint. The backend dispatches only when both `FRONTEND_ERROR_REPORTER` and
  `FRONTEND_ERROR_RATE_LIMITER` are bound; otherwise the endpoint is an intentional no-op.
- Gatekeeper management/configurator UIs run as Workshop-owned opaque-origin `srcDoc` frames. They
  send bounded reports with `postMessage`; the host accepts them only from the known frame window
  with origin `null`, adds host-owned surface/vendor context, and performs the same-origin POST.
  Do not add direct cross-origin reporting from a gatekeeper Worker domain.
- Frontend reports and frame metadata are diagnostic only and never convey identity or authority.
  Install automatic capture only in trusted first-party surfaces, never gadget/user-authored code.
  Exception messages and stacks reach the external Reporter, so never intentionally put secrets,
  prompts, tokens, headers, or request/response bodies in thrown errors or report metadata.
