// Input checks shared by the API services. Each throws a RequestError whose message names the field.
import { RequestError } from "./api-error";
import { isIsoDate } from "./dates";
import { roundMoney } from "./money";

export function requiredText(value: unknown, field: string, max = 255): string {
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (!text) throw new RequestError(`${field} is required.`);
    if (text.length > max) throw new RequestError(`${field} must be at most ${max} characters.`);
    return text;
}

export function optionalText(value: unknown, field: string, max = 255): string | null {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (text.length > max) throw new RequestError(`${field} must be at most ${max} characters.`);
    return text || null;
}

// A non-negative amount rounded to cents, or null when left blank
export function optionalAmount(value: unknown, field: string): number | null {
    if (value === undefined || value === null || value === "") return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) throw new RequestError(`${field} must be a number of 0 or more.`);
    if (amount >= 1e8) throw new RequestError(`${field} is too large.`);
    return roundMoney(amount);
}

export function positiveNumber(value: unknown, field: string): number {
    const n = Number(value);
    if (value === null || value === "" || !Number.isFinite(n) || n <= 0) throw new RequestError(`${field} must be greater than 0.`);
    if (n >= 1e8) throw new RequestError(`${field} is too large.`);
    return n;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new RequestError(`${field} must be true or false.`);
    return value;
}

export function isoDate(value: unknown, field: string): string {
    if (!isIsoDate(value)) throw new RequestError(`${field} must be a valid date (YYYY-MM-DD).`);
    return value;
}

export function positiveId(value: unknown, what = "id"): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new RequestError(`Invalid ${what}.`, 400);
    return id;
}

// ─── Query string parameters ──────────────────────────────────────────────────

export function dateParam(params: URLSearchParams, name: string): string | null {
    const value = params.get(name);
    if (value === null || value === "") return null;
    if (!isIsoDate(value)) throw new RequestError(`Invalid parameter: ${name} must be a YYYY-MM-DD date`);
    return value;
}

// Both ends of a date range, which must not be the wrong way round
export function dateRangeParams(params: URLSearchParams, required = false): { from: string | null; to: string | null } {
    const from = dateParam(params, "from");
    const to = dateParam(params, "to");
    if (required && (!from || !to)) throw new RequestError("Invalid parameters: from and to (YYYY-MM-DD) are required");
    if (from && to && from > to) throw new RequestError("Invalid parameters: from must not be after to");
    return { from, to };
}

export function pageParams(params: URLSearchParams, defaultSize = 50, maxSize = 200): { page: number; pageSize: number } {
    const page = params.get("page") === null ? 1 : Number(params.get("page"));
    const pageSize = params.get("page_size") === null ? defaultSize : Number(params.get("page_size"));
    if (!Number.isInteger(page) || page < 1) throw new RequestError("Invalid parameter: page must be a positive integer");
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxSize) {
        throw new RequestError(`Invalid parameter: page_size must be between 1 and ${maxSize}`);
    }
    return { page, pageSize };
}

export function statusParam(params: URLSearchParams): "posted" | "void" | null {
    const status = params.get("status");
    if (status === null || status === "" || status === "all") return null;
    if (status !== "posted" && status !== "void") throw new RequestError('Invalid parameter: status must be "posted", "void" or "all"');
    return status;
}

// For "the same name already exists" checks: names compare without case or surrounding spaces
export function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
