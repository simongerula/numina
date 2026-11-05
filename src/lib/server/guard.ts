/**
 * Local-only request guard.
 *
 * The app is designed to be run at 127.0.0.1 only. Two layers of defense:
 *
 * 1. HOST CHECK — every request to /api/* must target a loopback hostname.
 *    This defeats DNS-rebinding attacks (an attacker page can only reach this
 *    server through its own domain, whose Host header will not match).
 *
 * 2. ORIGIN CHECK — state-changing (non-GET) requests must carry an Origin
 *    header that exactly matches the request host. This defeats cross-site
 *    request forgery from any remote page posting to http://127.0.0.1:xxxx.
 *
 * Returns a 403 Response when the request is not acceptable, else null.
 */

const HOST_RE = [
  /^localhost(:\d+)?$/i,
  /^127\.0\.0\.1(:\d+)?$/,
  /^\[::1\](:\d+)?$/,
];

function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  return HOST_RE.some((re) => re.test(host));
}

// Same-origin form posts and fetches normally include Origin; if it is absent
// entirely (direct-cli, curl) we keep the strict rule off GETs only.
export function localGuard(req: Request): Response | null {
  const host = req.headers.get("host");

  if (!isLocalHost(host)) {
    return Response.json({ error: "Forbidden: local only" }, { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (!origin || new URL(origin).host !== host) {
      return Response.json({ error: "Forbidden: bad origin" }, { status: 403 });
    }
  }

  return null;
}

/** Shared handler wrapper: guard + zod parse + uniform error shape. */
export async function handleRequest(
  req: Request,
  fn: () => Promise<unknown> | unknown
): Promise<Response> {
  const blocked = localGuard(req);
  if (blocked) return blocked;

  try {
    const result = await fn();
    return Response.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof InputError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[api] unexpected error:", err);
    // Never leak internals to the client.
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export class InputError extends Error {}
