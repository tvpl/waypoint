/**
 * Outbound HTTP for user-supplied URLs (link metadata, embed checks).
 *
 * Guards against SSRF:
 *  - only http/https, no credentials in URL
 *  - hostnames like localhost / *.local / *.internal / single-label names rejected
 *  - every resolved IP is checked against private/reserved ranges at connect
 *    time (custom DNS lookup), which also defeats DNS rebinding
 *  - redirects followed manually (max 5), each hop re-validated
 *  - timeout, response size cap, content-type allow-list
 */
import dns from "node:dns";
import net from "node:net";
import { Agent, request } from "undici";

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

export class UnsafeUrlError extends Error {}

export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d / ::ffff:7f00:1) and NAT64 addresses embed an IPv4
    const embedded = /^(?:::ffff:|64:ff9b::)(.+)$/.exec(lower)?.[1];
    if (embedded) {
      const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(embedded);
      const v4 = hex
        ? [parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255, parseInt(hex[2], 16) >> 8, parseInt(hex[2], 16) & 255].join(".")
        : embedded;
      if (net.isIPv4(v4)) return blocked.check(v4, "ipv4");
      return true;
    }
    return blocked.check(lower, "ipv6");
  }
  return true;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp", ".localdomain"];

/** Synchronous URL-level checks (scheme, credentials, hostname shape, literal IPs). */
export function assertSafeUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL inválida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Apenas http(s) é permitido.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs com credenciais não são permitidas.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("Host inválido.");
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new UnsafeUrlError("Endereço de rede interna não permitido.");
    return url;
  }
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".")) {
    throw new UnsafeUrlError("Host interno não permitido.");
  }
  // numeric-looking hosts (e.g. 2130706433, 0x7f.1) can be parsed as IPs by resolvers
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) throw new UnsafeUrlError("Host inválido.");
  return url;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
      return callback(Object.assign(new UnsafeUrlError("Endereço de rede interna não permitido."), { code: "EBLOCKED" }), "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

let agent: Agent | null = null;
function getAgent() {
  agent ??= new Agent({
    connect: { lookup: guardedLookup as never, timeout: 5000 },
    headersTimeout: 6000,
    bodyTimeout: 6000,
  });
  return agent;
}

export type SafeResponse = {
  url: string;
  status: number;
  headers: Record<string, string>;
  contentType: string;
  body: string;
};

export async function safeFetch(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; accept?: RegExp; method?: "GET" | "HEAD" } = {},
): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  let url = assertSafeUrl(raw);

  for (let hop = 0; ; hop++) {
    const res = await request(url, {
      method: opts.method ?? "GET",
      dispatcher: getAgent(),
      signal,
      headers: {
        "user-agent": "WaypointBot/1.0 (+link preview)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v ?? "");

    if (res.statusCode >= 300 && res.statusCode < 400 && headers.location) {
      await res.body.dump();
      if (hop >= maxRedirects) throw new UnsafeUrlError("Redirecionamentos demais.");
      url = assertSafeUrl(new URL(headers.location, url));
      continue;
    }

    const contentType = (headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (opts.accept && !opts.accept.test(contentType)) {
      await res.body.dump();
      return { url: url.toString(), status: res.statusCode, headers, contentType, body: "" };
    }
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) {
        // keep what we have (the <head> is usually at the start), stop reading
        chunks.push(Buffer.from(chunk).subarray(0, Math.max(0, maxBytes - (size - chunk.length))));
        res.body.destroy();
        break;
      }
      chunks.push(Buffer.from(chunk));
    }
    return { url: url.toString(), status: res.statusCode, headers, contentType, body: Buffer.concat(chunks).toString("utf8") };
  }
}
