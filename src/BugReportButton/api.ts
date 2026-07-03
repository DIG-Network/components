/**
 * HTTP client for the bugreport.dig.net abuse-protection contract. Every DIG app embedding
 * <BugReportButton> talks to the SAME backend (default `https://api.bugreport.dig.net`), so
 * this module implements the wire contract exactly — see SPEC.md §2 for the normative version.
 */
import type { ConsoleLogEntry } from "./consoleCapture";

/** Response from `GET /v1/challenge`. */
export interface ChallengeResponse {
  /** Opaque single-use challenge token, echoed back as `challenge_token` on submit. */
  token: string;
  /** Expiry, epoch milliseconds. Past this the server rejects the token with 403. */
  exp: number;
}

/** Body of `POST /v1/reports`. Field order/names are a wire contract — do not rename. */
export interface ReportPayload {
  repo: string;
  title?: string;
  description: string;
  reporter_contact?: string;
  url?: string;
  user_agent?: string;
  app_version?: string;
  console_logs?: ConsoleLogEntry[];
  screenshot?: string;
  /** Token from the most recent `GET /v1/challenge` call. */
  challenge_token: string;
  /** Honeypot — MUST be sent empty by a real user; a filled value marks the request as a bot to the server. */
  hp: string;
  /** `Date.now()` at the moment the report panel was opened; the server rejects implausibly-fast submits. */
  opened_at_ms: number;
}

/** A GitHub issue reference, returned when the server filed one. */
export interface IssueRef {
  number: number;
  url: string;
}

/** Outcome of `submitReport`, discriminated on `status` so callers can drive the 4 UI states. */
export type SubmitReportResult =
  | { status: "accepted"; id: string; issue: IssueRef | null }
  | { status: "challenge_expired" }
  | { status: "rate_limited"; message?: string }
  | { status: "error"; message: string };

/** Thrown by {@link fetchChallenge} on any transport or non-2xx failure. */
export class ApiError extends Error {
  readonly status?: number;
  readonly cause?: unknown;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

/** GET {apiBase}/v1/challenge — called every time the report panel opens. */
export async function fetchChallenge(apiBase: string): Promise<ChallengeResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/v1/challenge`, { method: "GET" });
  } catch (cause) {
    throw new ApiError("Could not reach the bug-report service.", { cause });
  }
  if (!response.ok) {
    throw new ApiError(`Challenge request failed (${response.status}).`, {
      status: response.status,
    });
  }
  const data = (await response.json()) as Partial<ChallengeResponse>;
  return { token: String(data.token ?? ""), exp: Number(data.exp ?? 0) };
}

/** Best-effort parse of the server's error envelope; never throws. */
async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message;
  } catch {
    return undefined;
  }
}

/**
 * POST {apiBase}/v1/reports. Never throws — every outcome (success, expired challenge, rate
 * limit, or any other failure) is represented in the returned discriminated union so the UI can
 * render an honest state instead of an unhandled rejection.
 */
export async function submitReport(
  apiBase: string,
  payload: ReportPayload,
): Promise<SubmitReportResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/v1/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    return {
      status: "error",
      message: cause instanceof Error ? cause.message : "Network error — could not send the report.",
    };
  }

  if (response.status === 403) {
    return { status: "challenge_expired" };
  }
  if (response.status === 429) {
    return { status: "rate_limited", message: await readErrorMessage(response) };
  }
  if (!response.ok) {
    return {
      status: "error",
      message: (await readErrorMessage(response)) ?? `Request failed (${response.status}).`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    issue?: IssueRef | null;
  };
  return { status: "accepted", id: data.id ?? "", issue: data.issue ?? null };
}
