// Calls Next.js route handlers directly, without starting a server.
// Requests are signed in as the seeded administrator unless `as` names another seeded user (or null for none).
import { sessionCookieFor, type TestUser } from "./test-db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each dynamic route types its own params
type Handler = (request: Request, context: any) => Response | Promise<Response>;

export interface CallResult {
    status: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response JSON is asserted field by field in tests
    body: any;
    headers: Headers;
}

export interface CallOptions {
    // Seeded user to send the request as; null sends no session cookie
    as?: TestUser | null;
    // Dynamic route segments, e.g. { id: "3" } for app/api/products/[id]
    params?: Record<string, string>;
}

export async function call(handler: Handler, path: string, init: RequestInit = {}, options: CallOptions = {}): Promise<CallResult> {
    const user = options.as === undefined ? "admin" : options.as;
    const headers = new Headers(init.headers);
    if (user) headers.set("cookie", await sessionCookieFor(user));

    const response = await handler(
        new Request(new URL(path, "http://localhost"), { ...init, headers }),
        { params: Promise.resolve(options.params ?? {}) }
    );
    const text = await response.text();
    let body: unknown = text;
    try {
        body = JSON.parse(text);
    } catch {
        // not JSON: keep the raw text
    }
    return { status: response.status, body, headers: response.headers };
}

export function get(handler: Handler, path: string, options?: CallOptions): Promise<CallResult> {
    return call(handler, path, {}, options);
}

function send(method: string) {
    return (handler: Handler, path: string, body: unknown, options?: CallOptions): Promise<CallResult> =>
        call(handler, path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: typeof body === "string" ? body : JSON.stringify(body),
        }, options);
}

export const post = send("POST");
export const patch = send("PATCH");

// Opens several pooled DB connections up front, so that requests fired together in a
// concurrency test really overlap instead of queueing behind new connection handshakes.
export async function warmUpConnections(handler: Handler, path: string, connections = 8): Promise<void> {
    await Promise.all(Array.from({ length: connections }, () => call(handler, path)));
}
