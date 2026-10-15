'use client';

// fetch() helpers for the pages: JSON in and out, and the server's own error message when a request fails.
import { responseErrorMessage } from './fetch-error';
import { backgroundFetch } from './use-live-refresh';

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'ApiError';
    }
}

const NETWORK_MESSAGE = 'Could not reach the server. Check the connection and try again.';

// True when a request never reached the server, as opposed to the server refusing it
export function isNetworkError(error: unknown): boolean {
    return error instanceof ApiError && error.status === 0;
}

async function parse<T>(response: Response, fallback: string): Promise<T> {
    if (!response.ok) throw new ApiError(await responseErrorMessage(response, fallback), response.status);
    return (await response.json()) as T;
}

// GET a JSON resource. `background` marks automatic refreshes, which don't count as user activity.
export async function apiGet<T>(url: string, options: { background?: boolean; signal?: AbortSignal } = {}): Promise<T> {
    let response: Response;
    try {
        response = options.background
            ? await backgroundFetch(url, { signal: options.signal })
            : await fetch(url, { cache: 'no-store', signal: options.signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new ApiError(NETWORK_MESSAGE, 0);
    }
    return parse<T>(response, 'The data could not be loaded. Please try again.');
}

// POST/PATCH JSON and return the JSON answer
export async function apiSend<T = { success: boolean; message?: string }>(url: string, method: 'POST' | 'PATCH', body: unknown = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        throw new ApiError(NETWORK_MESSAGE, 0);
    }
    return parse<T>(response, 'The change could not be saved. Please try again.');
}

// Every row of a paged list such as /api/sales/invoices (up to 10,000), for exports
export async function fetchAllPages<T>(path: string, params: object): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= 50; page++) {
        const result = await apiGet<{ rows: T[]; total: number }>(`${path}${queryString({ ...params, page, page_size: 200 })}`);
        all.push(...result.rows);
        if (all.length >= result.total || result.rows.length === 0) break;
    }
    return all;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

// Builds a query string from the set values only
export function queryString(params: object): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params) as [string, unknown][]) {
        if (value !== null && value !== undefined && value !== '' && value !== false) search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : '';
}
