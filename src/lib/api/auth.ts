export interface AuthApiResult {
  ok: boolean;
  status: number;
  message: string;
  fields?: Record<string, string>;
  code?: string;
  data: Record<string, unknown>;
}

/** POSTs JSON to an /api/auth route. A network failure is reported as a failed result, never as success. */
export async function postAuth(url: string, body: unknown): Promise<AuthApiResult> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: response.ok && data.ok === true,
      status: response.status,
      message: typeof data.message === "string" ? data.message : response.ok ? "" : "Something went wrong. Please try again.",
      fields: data.fields && typeof data.fields === "object" ? (data.fields as Record<string, string>) : undefined,
      code: typeof data.code === "string" ? data.code : undefined,
      data,
    };
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach the server. Check your connection and try again.", data: {} };
  }
}
