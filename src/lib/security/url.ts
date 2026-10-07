import net from "node:net";
import dns from "node:dns/promises";

/** True for loopback, private, link-local, CGNAT, multicast, metadata and other non-public ranges. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true;
}

export class UnsafeUrlError extends Error {
  name = "UnsafeUrlError";
}

/** Syntactic validation: http(s) only, no credentials, sane length. */
export function parseHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("Credentials in URL are not allowed");
  if (input.length > 2048) throw new UnsafeUrlError("URL too long");
  return url;
}

/** Full SSRF check: resolves the host and rejects non-public addresses. */
export async function assertPublicUrl(input: string, allowPrivate = false): Promise<URL> {
  const url = parseHttpUrl(input);
  if (allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("Host not allowed");
  }
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addrs.length === 0) throw new UnsafeUrlError("Host could not be resolved");
  if (addrs.some(isPrivateIp)) throw new UnsafeUrlError("Private or reserved address not allowed");
  return url;
}

const TRACKING = /^(utm_\w+|ref|ref_src|fbclid|gclid|mc_cid|mc_eid|igshid|source|si)$/i;

/** Canonical form for deduplication. */
export function canonicalizeUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    let out = url.toString();
    if (url.pathname !== "/" && out.endsWith("/") && !url.search) out = out.slice(0, -1);
    if (url.pathname === "/" && !url.search) out = out.replace(/\/$/, "");
    return out.replace(/^http:/, "https:");
  } catch {
    return input.trim();
  }
}
