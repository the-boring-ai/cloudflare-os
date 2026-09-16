## Hooks (push notifications)

Some services can push events to the Gadget (inbound email, webhooks, chat messages, etc.). A gatekeeper exposes this as a **hook**: the Gadget registers a callback, and the gatekeeper later invokes it when an event arrives. Hooks are persistent — they survive across sessions and server restarts — and are subject to the same observation/action approval model as everything else.

`gatekeeper-email` is the canonical reference implementation. Read it alongside the `HookController`, `HookInitiator`, and `ApprovalQueue.bindHook()` JSDoc in `gatekeeper.ts`.

### The pieces

- **Hook interface** (in `types.d.ts`): the methods the Gadget implements to receive events, e.g. `EmailHook.receiveEmail(email)`. It is implemented by the Gadget as an **`RpcTarget`** (or a plain function), *not* a `WorkerEntrypoint`. Reference it from `describe()` via `hookTsType`.
- **Session method**: a method like `subscribe(callback)` that the Gadget (or, more commonly, an agent in a one-off `executeCode` call) uses to register interest. The `callback` is a **persistent stub** (created by the Gadget with `ctx.restore()`), so it can be stored and re-invoked long after the session ends.
- **`HookController`** (a `WorkerEntrypoint` you implement): lets the overseer `enable()` / `disable()` the hook. All the state it needs must live in its `props`, so it is constructed via `this.ctx.exports.MyHookControllerImpl({props})` **at bind time**, immediately before calling `bindHook()` — see below.
- **`HookInitiator`** (provided to you by the overseer): you call `startHook()` on it when an event arrives.

### Lifecycle

1. **Register.** The Gadget calls your Session method (e.g. `subscribe(callback, filter)`). Inside it, construct a `HookController` whose `props` capture the specifics of *this* registration, then call `approvalQueue.bindHook(controller, callback, description)`. The overseer stores the callback and records the hook (initially **disabled**). Do **not** store the callback yourself — it is bound to the current session and would be revoked when the session ends.
2. **Enable.** When the user approves the hook in the Workshop UI, the overseer calls `controller.enable(initiator, target)`. Store the `initiator` Fetcher somewhere it can be reached when events arrive (e.g. an event-source DO). `target` identifies where the hook delivers (workspace, plus gadget when the hook is pinned to one); persist it alongside the initiator if you display or link to the target — the IDs are fixed when the hook is bound, so there is nothing to refresh. A gatekeeper that doesn't need it still has to declare the parameter, since RPC argument validation rejects arguments the receiver doesn't declare. Avoid storing any other state until enabled; everything else should already be in the controller's `props`.
3. **Deliver.** When the event occurs, call `initiator.startHook()`. This returns `{callback, approvalQueue}` bound to a fresh session. Call `authorizeObservation()` (a hook event is almost always an observation; register actions too if the callback's return value triggers side effects), then invoke the `callback` to deliver the event to the Gadget.
4. **Disable / delete.** The overseer calls `controller.disable()`. Forget the stored `initiator` and clean up all related state — `disable()` may never be called again, though the overseer may later call `enable()` afresh.

Because the callback is a persistent stub tied to a session, the gatekeeper never stores it directly; the overseer hands it back (re-bound to a new session) each time you call `startHook()`. See the SKELETON for the full code shape.

### Documentation

When defining a session interface with hooks, it's important to include comments that clearly state when a method expects to be passed a *persistent* stub created with `ctx.restore()`, as opposed to a regular RpcStub. The caller needs to do extra work to make sure the stub they provide you is persistent.
