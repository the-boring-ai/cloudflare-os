import { expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { McpFacetBase } from "../src/facet.js";
import { McpSessionBase } from "../src/session.js";
import { classifyTool, toolPolicyFingerprint, type ServerTrust } from "../src/tools.js";
import type { McpClient, McpTool } from "../src/client.js";
import type { ToolScope } from "../src/scope.js";
import type { ScopedCatalog } from "../src/catalog.js";
import type { ConnectionAccount } from "../src/connection.js";
import type { ResourceDescription } from "@gadgets/workshop-shared/gatekeeper";

const log = {
  debug() {}, info() {}, error() {},
  warnings: [] as string[],
  warn(message: string) { this.warnings.push(message); },
  with() { return this; },
};

function fakeSql(): SqlStorage {
  const db = new DatabaseSync(":memory:");
  return {
    exec<T>(query: string, ...bindings: SQLInputValue[]) {
      const rows = bindings.length > 0
        ? db.prepare(query).all(...bindings)
        : /^\s*(?:SELECT|INSERT.*RETURNING)/is.test(query)
          ? db.prepare(query).all()
          : (db.exec(query), []);
      return {
        toArray: () => rows as T[],
        one: () => rows[0] as T,
      };
    },
  } as unknown as SqlStorage;
}

class TestSession extends McpSessionBase {}

class TestFacet extends McpFacetBase<object, {
  endpoint: string;
  scope: ToolScope;
}, TestSession> {
  catalogResult: Promise<ScopedCatalog> = Promise.resolve({
    isPortal: false,
    truncated: false,
    tools: [
      classifyTool({ name: "list_issues", annotations: { readOnlyHint: true } } as never, "byo"),
    ],
  });
  catalogReads = 0;
  remoteTools: McpTool[] = [];
  remoteCalls = 0;
  toolCalls = 0;
  connectionGeneration = 1;
  beforeRemoteCall: (() => Promise<void>) | undefined;
  beforeCatalogRead: (() => Promise<void>) | undefined;

  protected get log() { return log; }
  protected get trust(): ServerTrust { return "byo"; }
  protected get sessionClass() { return TestSession; }
  protected get actionScopeTag() { return "test"; }
  protected get observerName() { return "the test server"; }
  protected account(): ConnectionAccount { throw new Error("not used"); }
  describe(): Promise<ResourceDescription> { throw new Error("not used"); }
  getTypeScriptTypes(): Promise<string> { throw new Error("not used"); }
  get serverName() { return "Test"; }
  protected override async catalog() {
    this.catalogReads++;
    await this.beforeCatalogRead?.();
    return this.catalogResult;
  }
  override async call<T>(
    fn: (client: McpClient, connectionGeneration: number) => Promise<T>,
  ): Promise<T> {
    this.remoteCalls++;
    await this.beforeRemoteCall?.();
    const client = {
      findTool: async (name: string) => this.remoteTools.find(tool => tool.name === name),
      listTools: async (
        _maxTools: number,
        include: (tool: McpTool) => boolean,
      ) => ({ tools: this.remoteTools.filter(include), truncated: false }),
      listMatchingToolSummaries: async (
        maxTools: number,
        include: (tool: McpTool) => boolean,
      ) => this.remoteTools.filter(include).slice(0, maxTools),
      callTool: async () => { this.toolCalls++; return { content: [] }; },
    } as unknown as McpClient;
    return fn(client, this.connectionGeneration);
  }
  setScope(scope: ToolScope) { this.ctx.props.scope = scope; }
  runDiscoveryTest<T>(operation: () => Promise<T>): Promise<T> {
    return this.runDiscovery(operation);
  }
}

function facet(scope: ToolScope = {}) {
    const ctx = {
      props: { endpoint: "https://example.com/mcp", scope },
      storage: { kv: {}, sql: fakeSql() },
  };
  return new TestFacet(ctx as never, {});
}

const queue = {
  dup() { return this; },
  authorizeObservation() {},
};

it("builds tool methods and falls back to the plain session when catalog loading fails", async () => {
  const subject = facet();
  const dynamic = await subject.startSession(queue as never);
  expect("listIssues" in dynamic).toBe(true);

  subject.catalogResult = Promise.reject(new Error("offline"));
  const fallback = await subject.startSession(queue as never);
  expect("listIssues" in fallback).toBe(false);
  expect(log.warnings).toContain("starting session without per-tool methods");
});

it("keeps facets owner-only using the connector's resource label", async () => {
  await expect(facet().addObserver("observer", {} as never))
    .rejects.toThrow(/test server.*only be opened by its owner/s);
});

it("discovers and resolves tools beyond the initially described catalog", async () => {
  const subject = facet();
  subject.catalogResult = Promise.resolve({ tools: [], isPortal: false, truncated: true });
  subject.remoteTools = [
    { name: "search_issues", description: "Search issues", annotations: { readOnlyHint: true } },
    { name: "create_issue", description: "Create an issue" },
  ];

  await expect(subject.searchTools("search")).resolves.toMatchObject([{
    tool: { name: "search_issues" }, mode: "read",
  }]);
  await expect(subject.findTool("create_issue")).resolves.toMatchObject({
    tool: { name: "create_issue" }, mode: "action",
  });
});

it("answers searches from a complete catalog without rescanning the endpoint", async () => {
  const subject = facet();
  subject.remoteTools = [{ name: "search_issues", description: "Remote copy" }];

  await expect(subject.searchTools("issues")).resolves.toMatchObject([{
    tool: { name: "list_issues" }, mode: "read",
  }]);
  expect(subject.remoteCalls).toBe(0);
});

it("does not hydrate a new portal-native tool past a complete non-portal catalog", async () => {
  const subject = facet();
  subject.remoteTools = [{ name: "portal_toggle_servers" }];

  await expect(subject.findTool("portal_toggle_servers")).resolves.toBeUndefined();
  expect(subject.remoteCalls).toBe(0);
});

it("rejects a name outside the grant before loading the catalog or calling the endpoint", async () => {
  const subject = facet({ tools: ["allowed"] });
  subject.catalogResult = Promise.resolve({ tools: [], isPortal: false, truncated: false });

  await expect(subject.findTool("forbidden")).resolves.toBeUndefined();
  expect(subject.catalogReads).toBe(0);
  expect(subject.remoteCalls).toBe(0);
});

it("does not hydrate portal-native tools from a portal's incomplete catalog", async () => {
  const subject = facet();
  subject.catalogResult = Promise.resolve({ tools: [], isPortal: true, truncated: true });
  subject.remoteTools = [{ name: "portal_toggle_servers" }];

  await expect(subject.findTool("portal_toggle_servers")).resolves.toBeUndefined();
  expect(subject.remoteCalls).toBe(0);
});

it("refreshes a hydrated tool's policy when requested for dispatch", async () => {
  const subject = facet();
  subject.catalogResult = Promise.resolve({ tools: [], isPortal: false, truncated: true });
  subject.remoteTools = [{ name: "search_issues", annotations: { readOnlyHint: true } }];

  await expect(subject.findTool("search_issues")).resolves.toMatchObject({ mode: "read" });
  subject.remoteTools = [{ name: "search_issues", annotations: { readOnlyHint: false } }];
  await expect(subject.resolveToolForCall("search_issues"))
    .resolves.toMatchObject({ entry: { mode: "action" } });
  expect(subject.remoteCalls).toBe(2);
});

it("refreshes portal identity before dispatching a newly portal-native tool", async () => {
  const subject = facet();
  subject.remoteTools = [
    { name: "portal_list_servers" },
    { name: "portal_toggle_servers" },
  ];

  await expect(subject.resolveToolForCall("portal_toggle_servers")).resolves.toBeUndefined();
});

it("bounds concurrent discovery work across distinct requests", async () => {
  const subject = facet();
  let active = 0;
  let maxActive = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls = Array.from({ length: 12 }, () => subject.runDiscoveryTest(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await gate;
    active--;
  }));

  await vi.waitFor(() => expect(active).toBe(4));
  expect(maxActive).toBe(4);
  release();
  await Promise.all(calls);
  expect(maxActive).toBe(4);
});

it("bounds concurrent catalog reads", async () => {
  const subject = facet();
  let active = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  subject.beforeCatalogRead = async () => {
    active++;
    await gate;
    active--;
  };

  const searches = Array.from({ length: 12 }, () => subject.searchTools("issues"));

  await vi.waitFor(() => expect(active).toBeGreaterThan(0));
  expect(active).toBe(4);
  release();
  await Promise.all(searches);
});

it("bounds approval-time tool revalidation", async () => {
  const subject = facet();
  const tool: McpTool = { name: "send", annotations: { readOnlyHint: false } };
  subject.catalogResult = Promise.resolve({
    isPortal: false,
    truncated: false,
    tools: [classifyTool(tool, "byo")],
  });
  subject.remoteTools = [tool];
  let active = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  subject.beforeRemoteCall = async () => {
    active++;
    await gate;
    active--;
  };
  const snapshot = {
    policyFingerprint: toolPolicyFingerprint(tool, "byo"),
    connectionGeneration: 1,
  };
  const actions = Array.from(
    { length: 12 }, (_, i) => subject.stageAction("send", { i }, snapshot).id);

  const applying = actions.map(action => subject.applyAction(action));

  await vi.waitFor(() => expect(active).toBeGreaterThan(0));
  expect(active).toBe(4);
  release();
  await Promise.all(applying);
});

it("does not dispatch after the connection generation changes", async () => {
  const subject = facet();
  const tool: McpTool = { name: "send" };
  subject.remoteTools = [tool];
  const action = subject.stageAction("send", {}, {
    policyFingerprint: toolPolicyFingerprint(tool, "byo"),
    connectionGeneration: 1,
  });
  subject.connectionGeneration = 2;

  await expect(subject.applyAction(action.id)).rejects.toThrow(/connection changed/i);
  expect(subject.toolCalls).toBe(0);
});

it("does not dispatch after effective tool policy changes", async () => {
  const subject = facet();
  const tool: McpTool = { name: "send" };
  subject.remoteTools = [{ name: "send", annotations: { readOnlyHint: true } }];
  const action = subject.stageAction("send", {}, {
    policyFingerprint: toolPolicyFingerprint(tool, "byo"),
    connectionGeneration: 1,
  });

  await expect(subject.applyAction(action.id)).rejects.toThrow(/policy changed/i);
  expect(subject.toolCalls).toBe(0);
});

it("does not dispatch a removed or newly out-of-scope tool", async () => {
  const tool: McpTool = { name: "send" };
  for (const configure of [
    (subject: TestFacet) => { subject.remoteTools = []; },
    (subject: TestFacet) => { subject.remoteTools = [tool]; subject.setScope({ tools: ["other"] }); },
  ]) {
    const subject = facet();
    const action = subject.stageAction("send", {}, {
      policyFingerprint: toolPolicyFingerprint(tool, "byo"),
      connectionGeneration: 1,
    });
    configure(subject);

    await expect(subject.applyAction(action.id)).rejects.toThrow(/no longer allowed|policy changed/i);
    expect(subject.toolCalls).toBe(0);
  }
});
