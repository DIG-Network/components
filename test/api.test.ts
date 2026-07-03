import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchChallenge, submitReport, ApiError } from "../src/BugReportButton/api";
import type { ReportPayload } from "../src/BugReportButton/api";

const API_BASE = "https://api.bugreport.dig.net";

describe("fetchChallenge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /v1/challenge and returns { token, exp }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: "tok-1", exp: 1700000000000 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchChallenge(API_BASE);

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/v1/challenge`, expect.any(Object));
    expect(result).toEqual({ token: "tok-1", exp: 1700000000000 });
  });

  it("throws an ApiError when the challenge request is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchChallenge(API_BASE)).rejects.toBeInstanceOf(ApiError);
  });

  it("throws an ApiError when fetch itself rejects (network failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network down")),
    );
    await expect(fetchChallenge(API_BASE)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("submitReport", () => {
  const basePayload: ReportPayload = {
    repo: "hub.dig.net",
    description: "It broke",
    url: "https://hub.dig.net/store/1",
    user_agent: "test-agent",
    challenge_token: "tok-1",
    hp: "",
    opened_at_ms: 1700000000000,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /v1/reports with the exact JSON payload (repo, description, challenge_token, hp, opened_at_ms)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "abc-123", stored: true, pending_github: true, issue: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitReport(API_BASE, basePayload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/v1/reports`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(basePayload);
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.id).toBe("abc-123");
      expect(result.issue).toBeNull();
    }
  });

  it("treats 202 as accepted too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: () =>
          Promise.resolve({
            id: "abc-999",
            issue: { number: 5, url: "https://github.com/DIG-Network/hub.dig.net/issues/5" },
          }),
      }),
    );

    const result = await submitReport(API_BASE, basePayload);
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.id).toBe("abc-999");
      expect(result.issue?.url).toContain("issues/5");
    }
  });

  it("returns a 'challenge_expired' result on 403 (caller refetches + lets the user retry)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { code: "invalid_challenge" } }),
      }),
    );

    const result = await submitReport(API_BASE, basePayload);
    expect(result.status).toBe("challenge_expired");
  });

  it("returns a 'rate_limited' result on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { code: "rate_limited", message: "slow down" } }),
      }),
    );

    const result = await submitReport(API_BASE, basePayload);
    expect(result.status).toBe("rate_limited");
  });

  it("returns an 'error' result on any other non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { code: "internal", message: "kaboom" } }),
      }),
    );

    const result = await submitReport(API_BASE, basePayload);
    expect(result.status).toBe("error");
  });

  it("returns an 'error' result when fetch rejects outright (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const result = await submitReport(API_BASE, basePayload);
    expect(result.status).toBe("error");
  });
});

describe("submitReport — tolerant body parsing (branch coverage)", () => {
  const payload: ReportPayload = {
    repo: "hub.dig.net",
    description: "It broke",
    challenge_token: "tok-1",
    hp: "",
    opened_at_ms: 1,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles a non-JSON error body on 429 (message undefined, still rate_limited)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.reject(new SyntaxError("not json")),
      }),
    );
    const result = await submitReport(API_BASE, payload);
    expect(result).toEqual({ status: "rate_limited", message: undefined });
  });

  it("handles a non-JSON error body on 500 with a generic status message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new SyntaxError("not json")),
      }),
    );
    const result = await submitReport(API_BASE, payload);
    expect(result).toEqual({ status: "error", message: "Request failed (500)." });
  });

  it("handles an accepted response with an unparseable body (id falls back to empty)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("not json")),
      }),
    );
    const result = await submitReport(API_BASE, payload);
    expect(result).toEqual({ status: "accepted", id: "", issue: null });
  });

  it("returns a generic network message when fetch rejects with a non-Error value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("weird-rejection"));
    const result = await submitReport(API_BASE, payload);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/network error/i);
    }
  });

  it("fetchChallenge tolerates a body missing fields (token/exp coerced to defaults)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }),
    );
    const result = await fetchChallenge(API_BASE);
    expect(result).toEqual({ token: "", exp: 0 });
  });
});
