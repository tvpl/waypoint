import type { Notification, NotificationConstructorOptions } from "electron";
import type { ServerHandle } from "./server";

type Delivery = {
  id: string;
  claimToken: string;
  title: string;
  workspaceName: string;
  workspaceId: string;
  kind: "start" | "finish" | "followup";
  channel: "sound" | "silent";
  deadlineAt: number;
  timeZone: string;
  dateOnly: boolean;
  snoozeMinutes: number;
};
const labels = {
  start: "Lembrete de início",
  finish: "Lembrete de conclusão",
  followup: "Lembrete de acompanhamento",
};
export type NotificationEnvironment = {
  supported(): boolean;
  create(options: NotificationConstructorOptions): Notification;
  cookies(origin: string): Promise<{ value: string }[]>;
};

/** Runs independently of windows. The server owns the durable schedule and delivery leases. */
export class TaskNotifications {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private paused = false;
  private shown = new Map<Notification, Delivery[]>();
  constructor(
    private server: () => ServerHandle | null,
    private open: (path: string) => void,
    private environment: NotificationEnvironment,
  ) {}
  start() {
    if (this.timer) return;
    this.paused = false;
    this.timer = setInterval(() => void this.poll(), 30_000);
    void this.poll();
  }
  stop() {
    this.paused = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clear();
  }
  pause() {
    this.paused = true;
    this.clear();
  }
  resume() {
    this.paused = false;
    void this.poll();
  }
  sessionChanged() {
    this.clear();
    void this.poll();
  }
  private clear() {
    this.shown.forEach((_, n) => n.close());
    this.shown.clear();
  }
  private async request(body: unknown) {
    const server = this.server();
    if (!server) return null;
    const cookies = await this.environment.cookies(server.origin);
    if (!cookies[0]) {
      this.clear();
      return null;
    }
    const response = await fetch(`${server.origin}/api/desktop/reminders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-waypoint-desktop": server.secret,
        cookie: `wp_session=${cookies[0].value}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if (response.status === 401) this.clear();
      return null;
    }
    return response.json();
  }
  async poll() {
    if (this.busy || this.paused || !this.environment.supported()) return;
    this.busy = true;
    try {
      const data = await this.request({ action: "poll" });
      if (this.paused || !data) return;
      for (const [notification, items] of this.shown) {
        if (
          items.some(
            (item) =>
              !data.active?.some(
                (row: { id: string; claimToken: string | null }) =>
                  row.id === item.id && row.claimToken === item.claimToken,
              ),
          )
        ) {
          notification.close();
          this.shown.delete(notification);
        }
      }
      const groups = new Map<string, Delivery[]>();
      for (const item of data.reminders ?? [])
        groups.set(item.workspaceId, [
          ...(groups.get(item.workspaceId) ?? []),
          item,
        ]);
      for (const items of groups.values()) this.deliver(items);
    } catch (e) {
      console.warn(
        "[reminders] Delivery deferred:",
        e instanceof Error ? e.message : "unavailable",
      );
    } finally {
      this.busy = false;
    }
  }
  private deliver(items: Delivery[]) {
    const first = items[0],
      grouped = items.length > 1;
    const at = new Intl.DateTimeFormat("pt-BR", {
      timeZone: first.timeZone,
      day: "2-digit",
      month: "2-digit",
      ...(first.dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
    }).format(first.deadlineAt);
    const notification = this.environment.create({
      title: grouped
        ? `${items.length} lembretes de tarefas`
        : labels[first.kind],
      subtitle: grouped ? "Sua central de lembretes" : first.workspaceName,
      body: grouped
        ? items
            .slice(0, 3)
            .map((v) => v.title)
            .join(" · ") + (items.length > 3 ? "…" : "")
        : `${first.title}\nMeta: ${at}`,
      silent: items.every((v) => v.channel === "silent"),
      groupId: "waypoint-tasks",
      actions: [
        {
          type: "button",
          text: grouped
            ? "Adiar todos"
            : `Adiar ${first.snoozeMinutes === 1440 ? "1 dia" : `${first.snoozeMinutes} min`}`,
        },
        { type: "button", text: grouped ? "Dispensar todos" : "Dispensar" },
      ],
    });
    this.shown.set(notification, items);
    // Keep references for native callbacks without growing for an app that runs for weeks.
    if (this.shown.size > 50) {
      const oldest = this.shown.keys().next().value!;
      oldest.close();
      this.shown.delete(oldest);
    }
    const report = (action: "shown" | "failed" | "snooze" | "dismiss") => {
      for (const item of items)
        void this.request({
          action,
          id: item.id,
          token: item.claimToken,
        }).catch(() => {});
    };
    notification.once("show", () => report("shown"));
    notification.once("failed", () => {
      this.shown.delete(notification);
      report("failed");
    });
    notification.on("click", () =>
      this.open(
        `/api/task-reminders/open?id=${encodeURIComponent(first.id)}${grouped ? "&central=1" : ""}`,
      ),
    );
    notification.on("action", (details) => {
      report(details.actionIndex === 0 ? "snooze" : "dismiss");
      notification.close();
      this.shown.delete(notification);
    });
    // Closing a banner is not a reliable acknowledgement on macOS; keep it in the inbox.
    notification.show();
  }
  test(): Promise<{ supported: boolean; sent: boolean }> {
    if (!this.environment.supported())
      return Promise.resolve({ supported: false, sent: false });
    return new Promise((resolve) => {
      const n = this.environment.create({
        title: "Waypoint · Notificações",
        body: "Tudo pronto para lembrar dos seus próximos passos.",
      });
      this.shown.set(n, []);
      const timer = setTimeout(
        () => resolve({ supported: true, sent: false }),
        10_000,
      );
      n.once("show", () => {
        clearTimeout(timer);
        resolve({ supported: true, sent: true });
      });
      n.once("failed", () => {
        clearTimeout(timer);
        this.shown.delete(n);
        resolve({ supported: true, sent: false });
      });
      n.show();
    });
  }
}
