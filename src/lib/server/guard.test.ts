import { describe, expect, it } from "vitest";
import { handleRequest, InputError, localGuard } from "./guard";

const LOOPBACK = "http://127.0.0.1:3000";

function req(
  path = "/api/test",
  method = "GET",
  headers: Record<string, string> = {}
): Request {
  return new Request(LOOPBACK + path, { method, headers });
}

describe("localGuard — host check (DNS-rebinding defense)", () => {
  it("accepts loopback hosts", () => {
    for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000"]) {
      expect(localGuard(req("/api/x", "GET", { host }))).toBeNull();
    }
  });

  it("rejects missing or non-loopback hosts", () => {
    expect(localGuard(req("/api/x", "GET", { host: "evil.example:3000" }))?.status).toBe(403);
    expect(localGuard(req("/api/x", "GET", {}))?.status).toBe(403);
  });

  it("rejects a rebinding host that merely contains a loopback string", () => {
    const res = localGuard(req("/api/x", "GET", { host: "127.0.0.1.evil.example" }));
    expect(res?.status).toBe(403);
  });
});

describe("localGuard — origin check (CSRF defense)", () => {
  it("does not require Origin on GET/HEAD", () => {
    expect(localGuard(req("/api/x", "GET", { host: "127.0.0.1:3000" }))).toBeNull();
    expect(localGuard(req("/api/x", "HEAD", { host: "127.0.0.1:3000" }))).toBeNull();
  });

  it("rejects writes with no Origin", () => {
    const res = localGuard(req("/api/x", "POST", { host: "127.0.0.1:3000" }));
    expect(res?.status).toBe(403);
  });

  it("accepts a write whose Origin matches the host", () => {
    const res = localGuard(
      req("/api/x", "POST", { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" })
    );
    expect(res).toBeNull();
  });

  it("rejects a cross-site Origin", () => {
    const res = localGuard(
      req("/api/x", "POST", { host: "127.0.0.1:3000", origin: "https://evil.example" })
    );
    expect(res?.status).toBe(403);
  });

  it("rejects a malformed Origin instead of crashing", () => {
    const res = localGuard(
      req("/api/x", "POST", { host: "127.0.0.1:3000", origin: "not-a-url" })
    );
    expect(res?.status).toBe(403);
  });
});

describe("handleRequest — uniform error shape", () => {
  it("wraps results as JSON", async () => {
    const res = await handleRequest(req("/api/x", "GET", { host: "127.0.0.1:3000" }), () => ({
      ok: 1,
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it("maps InputError to a 400 with the message", async () => {
    const res = await handleRequest(req("/api/x", "GET", { host: "127.0.0.1:3000" }), () => {
      throw new InputError("Nope");
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nope" });
  });

  it("returns a generic 500 without leaking internals", async () => {
    const res = await handleRequest(req("/api/x", "GET", { host: "127.0.0.1:3000" }), () => {
      throw new Error("secret database details");
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal error" });
  });

  it("blocks the handler entirely when the guard rejects", async () => {
    let called = false;
    const res = await handleRequest(req("/api/x", "POST"), () => {
      called = true;
    });
    expect(res.status).toBe(403);
    expect(called).toBe(false);
  });
});
