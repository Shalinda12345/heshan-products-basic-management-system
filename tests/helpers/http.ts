// Calls Next.js route handlers directly, without starting a server.
type Handler = (request: Request) => Response | Promise<Response>;

export interface CallResult {
    status: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response JSON is asserted field by field in tests
    body: any;
    headers: Headers;
}

export async function call(handler: Handler, path: string, init?: RequestInit): Promise<CallResult> {
    const response = await handler(new Request(new URL(path, "http://localhost"), init));
    const text = await response.text();
    let body: unknown = text;
    try {
        body = JSON.parse(text);
    } catch {
        // not JSON: keep the raw text
    }
    return { status: response.status, body, headers: response.headers };
}

export function get(handler: Handler, path: string): Promise<CallResult> {
    return call(handler, path);
}

export function post(handler: Handler, path: string, body: unknown): Promise<CallResult> {
    return call(handler, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

// Opens several pooled DB connections up front, so that requests fired together in a
// concurrency test really overlap instead of queueing behind new connection handshakes.
export async function warmUpConnections(handler: Handler, path: string, connections = 8): Promise<void> {
    await Promise.all(Array.from({ length: connections }, () => call(handler, path)));
}
