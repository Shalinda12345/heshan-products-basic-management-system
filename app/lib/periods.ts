// Reporting periods as inclusive "YYYY-MM-DD" ranges, and the period each one is compared with.
// Shared by the API and the pages (no server-only imports here).
import { parseLocalDate, toIsoDate } from "./dates";
import { MONTH_ABBR } from "./format";

export interface DateRange {
    from: string;
    to: string;
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function rangeDays({ from, to }: DateRange): number {
    return daysBetween(parseLocalDate(from), parseLocalDate(to)) + 1;
}

function isMonthStart(d: Date) {
    return d.getDate() === 1;
}

function isMonthEnd(d: Date) {
    return addDays(d, 1).getDate() === 1;
}

// The period a range is compared with: the previous month(s), quarter or year when the range is made of whole
// calendar months, otherwise the same number of days just before it.
export function previousPeriod(range: DateRange): DateRange {
    const from = parseLocalDate(range.from);
    const to = parseLocalDate(range.to);
    if (isMonthStart(from) && isMonthEnd(to)) {
        const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
        const prevFrom = new Date(from.getFullYear(), from.getMonth() - months, 1);
        const prevTo = new Date(from.getFullYear(), from.getMonth(), 0);
        return { from: toIsoDate(prevFrom), to: toIsoDate(prevTo) };
    }
    const days = daysBetween(from, to) + 1;
    return { from: toIsoDate(addDays(from, -days)), to: toIsoDate(addDays(from, -1)) };
}

// The same stretch of the previous month/year for a period still in progress, e.g. 1-13 Oct vs 1-13 Sep
export function samePeriodBefore(range: DateRange, unit: "day" | "week" | "month" | "year"): DateRange {
    const from = parseLocalDate(range.from);
    const to = parseLocalDate(range.to);
    if (unit === "day" || unit === "week") {
        const shift = unit === "day" ? 1 : 7;
        return { from: toIsoDate(addDays(from, -shift)), to: toIsoDate(addDays(to, -shift)) };
    }
    const back = (d: Date) => {
        const year = unit === "year" ? d.getFullYear() - 1 : d.getFullYear();
        const month = unit === "month" ? d.getMonth() - 1 : d.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(d.getDate(), lastDay));
    };
    return { from: toIsoDate(back(from)), to: toIsoDate(back(to)) };
}

export function monthRangeOf(year: number, month: number): DateRange {
    return { from: toIsoDate(new Date(year, month - 1, 1)), to: toIsoDate(new Date(year, month, 0)) };
}

export const PERIOD_PRESETS = {
    this_month: "This month",
    last_month: "Last month",
    this_quarter: "This quarter",
    last_quarter: "Last quarter",
    this_year: "This year",
    last_year: "Last year",
    last_30_days: "Last 30 days",
    last_90_days: "Last 90 days",
    last_12_months: "Last 12 months",
} as const;

export type PeriodPreset = keyof typeof PERIOD_PRESETS;

export function presetRange(preset: PeriodPreset, today = new Date()): DateRange {
    const y = today.getFullYear();
    const m = today.getMonth();
    const quarterStart = Math.floor(m / 3) * 3;
    const make = (from: Date, to: Date) => ({ from: toIsoDate(from), to: toIsoDate(to) });
    switch (preset) {
        case "this_month": return make(new Date(y, m, 1), new Date(y, m + 1, 0));
        case "last_month": return make(new Date(y, m - 1, 1), new Date(y, m, 0));
        case "this_quarter": return make(new Date(y, quarterStart, 1), new Date(y, quarterStart + 3, 0));
        case "last_quarter": return make(new Date(y, quarterStart - 3, 1), new Date(y, quarterStart, 0));
        case "this_year": return make(new Date(y, 0, 1), new Date(y, 11, 31));
        case "last_year": return make(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
        case "last_30_days": return make(addDays(today, -29), today);
        case "last_90_days": return make(addDays(today, -89), today);
        case "last_12_months": return make(new Date(y, m - 11, 1), new Date(y, m + 1, 0));
    }
}

// "1 Oct – 31 Oct 2026", "Oct 2026", "2026"
export function describeRange({ from, to }: DateRange): string {
    const a = parseLocalDate(from);
    const b = parseLocalDate(to);
    const month = (d: Date) => MONTH_ABBR[d.getMonth()];
    if (isMonthStart(a) && isMonthEnd(b)) {
        if (a.getMonth() === 0 && b.getMonth() === 11 && a.getFullYear() === b.getFullYear()) return String(a.getFullYear());
        if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${month(a)} ${a.getFullYear()}`;
        return `${month(a)} ${a.getFullYear() === b.getFullYear() ? "" : `${a.getFullYear()} `}– ${month(b)} ${b.getFullYear()}`.replace("  ", " ");
    }
    const day = (d: Date, withYear: boolean) => `${d.getDate()} ${month(d)}${withYear ? ` ${d.getFullYear()}` : ""}`;
    if (from === to) return day(a, true);
    return `${day(a, a.getFullYear() !== b.getFullYear())} – ${day(b, true)}`;
}
