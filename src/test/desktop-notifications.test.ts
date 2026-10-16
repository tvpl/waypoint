import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
const state = vi.hoisted(() => ({
  notifications: [] as (EventEmitter & {
    options: Record<string, unknown>;
    close: ReturnType<typeof vi.fn>;
  })[],
  cookies: [{ value: "session-token" }],
  supported: true,
}));
class NativeNotification extends EventEmitter {
  close = vi.fn();
  constructor(public options: Record<string, unknown>) {
    super();
    state.notifications.push(this);
  }
  show() {
    this.emit("show");
  }
}
import { TaskNotifications } from "../../desktop/src/reminders";
const delivery = (id: string, workspaceId = "ws") => ({
  id,
  workspaceId,
  workspaceName: workspaceId,
  claimToken: `token-${id}`,
  title: `Tarefa ${id}`,
  kind: "finish",
  channel: "silent",
  deadlineAt: Date.now(),
  timeZone: "America/Sao_Paulo",
  dateOnly: false,
  snoozeMinutes: 15,
});
const server = {
  origin: "http://127.0.0.1:1234",
  secret: "private-key",
  port: 1234,
  stop() {},
  tail: () => "",
  onExit() {},
};
let scheduler: TaskNotifications | null = null;
afterEach(() => {
  scheduler?.stop();
  scheduler = null;
  state.notifications = [];
  state.cookies = [{ value: "session-token" }];
  state.supported = true;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup(items = [delivery("a")]) {
  const open = vi.fn();
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    return new Response(
      JSON.stringify(
        body.action === "poll"
          ? { reminders: items, active: items }
          : { ok: true },
      ),
    );
  });
  vi.stubGlobal("fetch", fetch);
  scheduler = new TaskNotifications(() => server, open, {
    supported: () => state.supported,
    cookies: async () => state.cookies,
    create: (options) =>
      new NativeNotification(
        options as unknown as Record<string, unknown>,
      ) as unknown as ReturnType<
        import("../../desktop/src/reminders").NotificationEnvironment["create"]
      >,
  });
  return { scheduler, fetch, open };
}
describe("desktop notification delivery", () => {
  it("uses the gate and live session, acknowledges native display and opens the correct task", async () => {
    const { scheduler, fetch, open } = setup();
    await scheduler.poll();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const request = fetch.mock.calls[0][1];
    expect(request.headers).toMatchObject({
      "x-waypoint-desktop": server.secret,
      cookie: "wp_session=session-token",
    });
    expect(state.notifications[0].options).toMatchObject({
      title: "Lembrete de conclusão",
      silent: true,
    });
    state.notifications[0].emit("click");
    expect(open).toHaveBeenCalledWith("/api/task-reminders/open?id=a");
    state.notifications[0].emit("action", { actionIndex: 0 });
    await vi.waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([, init]) => JSON.parse(init.body as string).action === "snooze",
        ),
      ).toBe(true),
    );
    expect(state.notifications[0].close).toHaveBeenCalled();
  });
  it("groups simultaneous reminders within a workspace, retaining native bulk actions", async () => {
    const { scheduler, fetch, open } = setup([
      delivery("a"),
      delivery("b"),
      delivery("c", "other"),
    ]);
    await scheduler.poll();
    expect(state.notifications).toHaveLength(2);
    expect(state.notifications[0].options.title).toBe("2 lembretes de tarefas");
    state.notifications[0].emit("click");
    expect(open).toHaveBeenCalledWith(
      "/api/task-reminders/open?id=a&central=1",
    );
    state.notifications[0].emit("action", { actionIndex: 1 });
    await vi.waitFor(() =>
      expect(
        fetch.mock.calls.filter(
          ([, init]) => JSON.parse(init.body as string).action === "dismiss",
        ),
      ).toHaveLength(2),
    );
  });
  it("does not notify while locked or signed out, and reconciles cancelled notices", async () => {
    const { scheduler, fetch } = setup();
    scheduler.pause();
    await scheduler.poll();
    expect(fetch).not.toHaveBeenCalled();
    state.cookies = [];
    scheduler.resume();
    await scheduler.poll();
    expect(state.notifications).toHaveLength(0);
    await Promise.resolve();
    await Promise.resolve();
    state.cookies = [{ value: "new-session" }];
    await scheduler.poll();
    expect(state.notifications).toHaveLength(1);
    fetch.mockImplementation(
      async () => new Response(JSON.stringify({ reminders: [], active: [] })),
    );
    await scheduler.poll();
    expect(state.notifications[0].close).toHaveBeenCalled();
  });
  it("recovers from transport failure without losing the scheduler", async () => {
    const { scheduler, fetch } = setup();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetch.mockRejectedValueOnce(new Error("offline"));
    await scheduler.poll();
    expect(state.notifications).toHaveLength(0);
    await scheduler.poll();
    expect(state.notifications).toHaveLength(1);
    warning.mockRestore();
  });
});
