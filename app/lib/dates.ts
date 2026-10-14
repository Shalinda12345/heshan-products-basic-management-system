// Parses a "YYYY-MM-DD" (or ISO) string as local midnight, so a business date never shifts by a day
// the way `new Date("YYYY-MM-DD")` (UTC midnight) can.
export function parseLocalDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
}

// True for a real calendar date written as "YYYY-MM-DD"
export function isIsoDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = parseLocalDate(value);
    return toIsoDate(date) === value;
}

export function toIsoDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "YYYY-MM-DD" for a DATE column read through Drizzle, which hands it over as UTC midnight of that date
export function isoDateFromDb(value: Date | string): string {
    return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
