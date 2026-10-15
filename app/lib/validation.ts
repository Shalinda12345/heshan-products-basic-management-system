// Input checks shared by the API services. Each throws a RequestError whose message names the field.
import { RequestError } from "./api-error";
import { endOfDay, isIsoDate, startOfDay } from "./dates";
import { roundMoney } from "./money";
import { rangeDays, weekContaining, type DateRange } from "./periods";

// Amounts and quantities are stored as DOUBLE(10,2), which holds values below this
export const AMOUNT_LIMIT = 1e8;

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
    if (amount >= AMOUNT_LIMIT) throw new RequestError(`${field} is too large.`);
    return roundMoney(amount);
}

export function positiveNumber(value: unknown, field: string): number {
    const n = Number(value);
    if (value === null || value === "" || !Number.isFinite(n) || n <= 0) throw new RequestError(`${field} must be greater than 0.`);
    if (n >= AMOUNT_LIMIT) throw new RequestError(`${field} is too large.`);
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

// A whole-number parameter from `min` to `max`, or null when it is missing
export function intParam(params: URLSearchParams, name: string, min: number, max: number): number | null {
    const raw = params.get(name);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new RequestError(`Invalid parameter: ${name} must be a whole number from ${min} to ${max}`);
    }
    return value;
}

// ?year= and ?month= (1-12) of a report
export function yearMonthParams(params: URLSearchParams): { year: number | null; month: number | null } {
    return { year: intParam(params, "year", 1900, 2999), month: intParam(params, "month", 1, 12) };
}

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

// The period of a report: ?from= and ?to= are required, at most 10 years apart
export function reportRangeParams(params: URLSearchParams): DateRange {
    const { from, to } = dateRangeParams(params, true);
    const range = { from: from!, to: to! };
    if (rangeDays(range) > 3660) throw new RequestError("Invalid parameters: the period can be at most 10 years");
    return range;
}

// The dates a day/week/month listing covers, as local times for comparing with DATE columns: the month in
// ?year=&month=, otherwise the current day, week (Monday to Sunday) or month. A month listing takes either
// parameter alone; the others need both.
export function periodParams(params: URLSearchParams, fallback: "day" | "week" | "month", now = new Date()): { start: Date; end: Date } {
    const { year, month: monthNumber } = yearMonthParams(params);
    const month = monthNumber === null ? null : monthNumber - 1;
    if (fallback === "month" || (year !== null && month !== null)) {
        const y = year ?? now.getFullYear();
        const m = month ?? now.getMonth();
        return { start: new Date(y, m, 1), end: endOfDay(new Date(y, m + 1, 0)) };
    }
    if (fallback === "week") {
        const { start, end } = weekContaining(now);
        return { start, end: endOfDay(end) };
    }
    return { start: startOfDay(now), end: endOfDay(now) };
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

// A LIKE pattern matching `text` anywhere, with any % _ \ in it taken literally
export function likeContains(text: string): string {
    return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
