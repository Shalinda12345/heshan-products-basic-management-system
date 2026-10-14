// Client-side helper: the reason an API request failed, as sent in its JSON body ({ error } or { message }).
// Kept apart from api-error.ts so pages don't pull server-only database code into the browser bundle.
export async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
    const body = (await response.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
    const reason = body?.error ?? body?.message;
    return typeof reason === "string" && reason ? reason : fallback;
}
