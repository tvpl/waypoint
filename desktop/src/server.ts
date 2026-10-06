import { app, utilityProcess, type UtilityProcess } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export type ServerHandle = {
  origin: string;
  port: number;
  /** Per-launch key: only requests carrying it reach the app (see src/proxy.ts). */
  secret: string;
  stop(): void;
  /** Last lines the server printed, for error dialogs. */
  tail(): string;
  onExit(cb: (code: number) => void): void;
};

/** Default port: stable so the browser profile (localStorage) and the extension keep working. */
export const DEFAULT_PORT = 47615;

const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });

export async function pickPort(preferred: number): Promise<number> {
  for (let p = preferred; p < preferred + 40; p++) if (await portFree(p)) return p;
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

/** Repo root when running unpackaged (desktop/dist/server.js → ../..). */
const repoRoot = () => path.resolve(__dirname, "..", "..");

/**
 * Runs the Next.js server in an Electron utility process (Electron's own Node, so better-sqlite3's
 * N-API binary loads as is). Packaged: the standalone build in resources/server. `dev`: `next dev`
 * from the repo, with hot reload.
 */
export async function startServer(opts: { port: number; dataDir: string; dev: boolean }): Promise<ServerHandle> {
  const secret = crypto.randomBytes(32).toString("hex");
  const logDir = path.join(opts.dataDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, "server.log"), { flags: "w" });
  const lines: string[] = [];
  const write = (chunk: Buffer) => {
    log.write(chunk);
    lines.push(...chunk.toString().split("\n").filter(Boolean));
    if (lines.length > 60) lines.splice(0, lines.length - 60);
    if (!app.isPackaged) process.stdout.write(chunk);
  };

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORT: String(opts.port),
    HOSTNAME: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
    WAYPOINT_DESKTOP_SECRET: secret,
    WAYPOINT_DATA_DIR: opts.dataDir,
    // With the app lock on, sessions from before this launch don't count (src/server/desktop-security.ts).
    WAYPOINT_STARTED_AT: String(Date.now()),
    DATABASE_PATH: path.join(opts.dataDir, "waypoint.db"),
    UPLOADS_DIR: path.join(opts.dataDir, "uploads"),
  };
  delete env.ELECTRON_RUN_AS_NODE;

  let child: UtilityProcess;
  if (opts.dev) {
    const root = repoRoot();
    child = utilityProcess.fork(path.join(root, "node_modules", "next", "dist", "bin", "next"), ["dev", "--port", String(opts.port), "--hostname", "127.0.0.1"], {
      cwd: root,
      env: { ...env, NODE_ENV: "development" },
      stdio: "pipe",
      serviceName: "Waypoint server (dev)",
    });
  } else {
    const dir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "server");
    const entry = path.join(dir, "server.js");
    if (!fs.existsSync(entry)) throw new Error(`Servidor não encontrado em ${dir}. Rode "npm run desktop:server" antes.`);
    child = utilityProcess.fork(entry, [], { cwd: dir, env: { ...env, NODE_ENV: "production" }, stdio: "pipe", serviceName: "Waypoint server" });
  }
  child.stdout?.on("data", write);
  child.stderr?.on("data", write);

  let exited = false;
  const exitCbs: ((code: number) => void)[] = [];
  child.on("exit", (code) => {
    exited = true;
    log.end();
    exitCbs.forEach((cb) => cb(code));
  });

  const origin = `http://127.0.0.1:${opts.port}`;
  const deadline = Date.now() + (opts.dev ? 180_000 : 45_000);
  for (;;) {
    if (exited) throw new Error(`O servidor encerrou ao iniciar.\n\n${lines.slice(-15).join("\n")}`);
    try {
      // Any HTTP answer means it is listening (static files skip the proxy's key check).
      await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(2000) });
      break;
    } catch {}
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`O servidor não respondeu a tempo.\n\n${lines.slice(-15).join("\n")}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return {
    origin,
    port: opts.port,
    secret,
    stop: () => {
      if (!exited) child.kill();
    },
    tail: () => lines.slice(-15).join("\n"),
    onExit: (cb) => exitCbs.push(cb),
  };
}
