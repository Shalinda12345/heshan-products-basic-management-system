// Display formatting shared by the pages and by server-written text such as activity log summaries.
// A fixed locale keeps server and browser output identical.

const LOCALE = "en-US";

const moneyFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });

// "Rs. 1,234.50"
export function formatMoney(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    return `${n < 0 ? "−" : ""}Rs. ${moneyFormat.format(Math.abs(n))}`;
}

// "1,234.50" (no currency), for table cells under a "Rs." heading
export function formatAmount(value: number | null | undefined): string {
    return moneyFormat.format(Number(value ?? 0));
}

// "12" or "12.5"
export function formatQty(value: number | null | undefined): string {
    return qtyFormat.format(Number(value ?? 0));
}

// "1.2M", "45.3K"
export function formatCompact(value: number | null | undefined): string {
    return compactFormat.format(Number(value ?? 0));
}

// "+12.3%" / "−4.0%", or "—" when there is nothing to compare with
export function formatChange(pct: number | null | undefined): string {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
    const rounded = Math.round(pct * 10) / 10;
    return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(1)}%`;
}

export function formatPercent(pct: number | null | undefined, digits = 1): string {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
    const text = Math.abs(pct).toFixed(digits);
    return `${pct < 0 && Number(text) !== 0 ? "−" : ""}${text}%`;
}

// Percentage change from `previous` to `current`, or null when previous is 0
export function percentChange(current: number, previous: number): number | null {
    if (!previous) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

// For figures that can go negative (profit): a percentage only between two positive values, else null
export function percentChangeOfPositive(current: number, previous: number): number | null {
    return current >= 0 && previous > 0 ? percentChange(current, previous) : null;
}

// "+Rs. 2,320.00" / "−Rs. 2,320.00": a change shown in money instead of percent
export function formatMoneyChange(difference: number): string {
    return `${difference > 0 ? "+" : difference < 0 ? "−" : ""}Rs. ${moneyFormat.format(Math.abs(difference))}`;
}

function asDate(value: string | Date): Date {
    if (value instanceof Date) return value;
    // A bare "YYYY-MM-DD" is a business date: read it as local midnight, not UTC
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

// Month abbreviations spelled out here: locale data differs between Node and browsers ("Sep" vs "Sept")
export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "13 Oct 2026"
export function formatDate(value: string | Date | null | undefined): string {
    if (!value) return "—";
    const date = asDate(value);
    return Number.isNaN(date.getTime()) ? "—" : `${date.getDate()} ${MONTH_ABBR[date.getMonth()]} ${date.getFullYear()}`;
}

// "13 Oct 2026, 14:05"
export function formatDateTime(value: string | Date | null | undefined): string {
    if (!value) return "—";
    const date = asDate(value);
    if (Number.isNaN(date.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${formatDate(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
