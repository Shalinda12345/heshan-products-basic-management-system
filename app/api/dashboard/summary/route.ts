import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { customers, sales, expenses } from "@/app/db/schema";
import { and, gte, lte, sql } from "drizzle-orm";
import { toReadErrorResponse } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { parseLocalDate, toIsoDate } from "@/app/lib/dates";
import { samePeriodBefore, type DateRange } from "@/app/lib/periods";
import { postedSale } from "@/app/services/sales";
import { postedExpense } from "@/app/services/expenses";
import { expenseCategoryOf } from "@/app/services/reports";

export const dynamic = "force-dynamic";

// ---------- helpers ----------
function startOfDay(d: Date) {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
}
function endOfDay(d: Date) {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return r;
}

// Returns [start, end] dates based on the requested period
function getDateRange(period: string, years: number, selectedYear?: number, selectedMonth?: number): [Date, Date] {
    const now = new Date();

    if (period === "day") {
        return [startOfDay(now), endOfDay(now)];
    }

    if (period === "week") {
        const start = new Date(now);
        const dow = now.getDay();
        // Make week start on Monday
        start.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
        return [startOfDay(start), endOfDay(now)];
    }

    if (period === "month") {
        const yr = selectedYear ?? now.getFullYear();
        const mo = selectedMonth ? selectedMonth - 1 : now.getMonth();
        const start = new Date(yr, mo, 1, 0, 0, 0, 0);
        const end = new Date(yr, mo + 1, 0, 23, 59, 59, 999);
        return [start, end];
    }

    if (period === "year") {
        const yr = selectedYear ?? now.getFullYear();
        const start = new Date(yr, 0, 1, 0, 0, 0, 0);
        const end = new Date(yr, 11, 31, 23, 59, 59, 999);
        return [start, end];
    }

    // multi-year: go back `years` full years from Jan 1 of (currentYear - years + 1)
    const safeYears = Math.max(2, Math.min(years, 10));
    const endYr = selectedYear ?? now.getFullYear();
    const start = new Date(endYr - safeYears + 1, 0, 1, 0, 0, 0, 0);
    const end = new Date(endYr, 11, 31, 23, 59, 59, 999);
    return [start, end];
}

// Safely parse a date value returned by Drizzle (may be Date object or string)
function parseDate(raw: Date | string | null | undefined): Date | null {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    // MySQL date strings come back as "YYYY-MM-DD" — parse as local time
    // to avoid UTC midnight shifting the day.
    const parts = (raw as string).split("-");
    if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(raw as string);
}

// Builds an aggregation map keyed by chart label
function aggregateByLabel<T>(
    records: T[],
    getDate: (r: T) => Date | string | null | undefined,
    getLabelFn: (d: Date) => string,
    getValue: (r: T) => number
): Map<string, number> {
    const map = new Map<string, number>();
    for (const r of records) {
        const d = parseDate(getDate(r));
        if (!d) continue;
        const label = getLabelFn(d);
        map.set(label, (map.get(label) ?? 0) + getValue(r));
    }
    return map;
}

// Generates the ordered list of bucket labels for a period
function buildLabels(period: string, start: Date, end: Date): string[] {
    // FIX: "day" period uses sale_date which is a DATE column (no time).
    // Hourly buckets are meaningless. Instead show each day in the last 7 days
    // up to and including today so the chart always has a point for today.
    if (period === "day") {
        // Show today's date as a single label (one summary bar)
        return [formatDate(start)];
    }

    if (period === "week") {
        // Enumerate Mon → current day of week
        const labels: string[] = [];
        const cur = new Date(start);
        while (cur <= end) {
            labels.push(formatDate(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return labels;
    }

    if (period === "month") {
        const labels: string[] = [];
        const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            labels.push(String(d));
        }
        return labels;
    }

    if (period === "year") {
        return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    }

    // multi-year: one label per month across the range
    const labels: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
        labels.push(formatMonthYear(cur));
        cur.setMonth(cur.getMonth() + 1);
    }
    return labels;
}

function formatDate(d: Date): string {
    return `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`;
}

function formatMonthYear(d: Date): string {
    return `${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
}

// Maps a record's date to the correct chart label for the given period
function getLabelFn(period: string): (d: Date) => string {
    if (period === "day") {
        // FIX: no hourly granularity — group by full date string
        return (d) => formatDate(d);
    }
    if (period === "week") {
        // Group by date (Mon 30 Jun, etc.)
        return (d) => formatDate(d);
    }
    if (period === "month") {
        return (d) => String(d.getDate());
    }
    if (period === "year") {
        const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return (d) => names[d.getMonth()];
    }
    // multi-year
    return (d) => formatMonthYear(d);
}

// The stretch of time the selected period is compared with: the same days of the previous day/week/month/year
// while the period is still running, else the whole previous one. The multi-year view has no comparison.
function comparisonRange(period: string, start: Date, end: Date): { range: DateRange; label: string } | null {
    if (period === "multi") return null;
    const now = new Date();
    const inProgress = start <= now && now <= end;
    const unit = period === "day" ? "day" : period === "week" ? "week" : period === "year" ? "year" : "month";
    // Weeks and days are already "so far" ranges (the week runs Monday to today)
    const span: DateRange = { from: toIsoDate(start), to: toIsoDate(inProgress && (unit === "month" || unit === "year") ? now : end) };
    const range = samePeriodBefore(span, unit);
    const names = { day: "yesterday", week: "the same days last week", month: "last month", year: "last year" } as const;
    const label = inProgress && unit !== "day"
        ? (unit === "week" ? `vs ${names.week}` : `vs the same days ${names[unit]}`)
        : `vs ${unit === "day" ? names.day : `the previous ${unit}`}`;
    if (!inProgress && unit !== "day" && unit !== "week") {
        // A finished month or year is compared with the whole one before it
        const from = parseLocalDate(span.from);
        const prev = unit === "month"
            ? { from: new Date(from.getFullYear(), from.getMonth() - 1, 1), to: new Date(from.getFullYear(), from.getMonth(), 0) }
            : { from: new Date(from.getFullYear() - 1, 0, 1), to: new Date(from.getFullYear() - 1, 11, 31) };
        return { range: { from: toIsoDate(prev.from), to: toIsoDate(prev.to) }, label };
    }
    return { range, label };
}

async function totalsBetween(range: DateRange) {
    const from = parseLocalDate(range.from);
    const to = parseLocalDate(range.to);
    const [[salesTotal], [expenseTotal]] = await Promise.all([
        db.select({ total: sql<number>`COALESCE(SUM(${sales.grand_total}), 0)` })
            .from(sales).where(and(gte(sales.sale_date, from), lte(sales.sale_date, to), postedSale)),
        db.select({ total: sql<number>`COALESCE(SUM(${expenses.total}), 0)` })
            .from(expenses).where(and(gte(expenses.expense_date, from), lte(expenses.expense_date, to), postedExpense)),
    ]);
    const totalSales = Number(salesTotal.total);
    const totalExpenses = Number(expenseTotal.total);
    const netProfit = totalSales - totalExpenses;
    return {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalExpenses: parseFloat(totalExpenses.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        profitMargin: parseFloat((totalSales > 0 ? (netProfit / totalSales) * 100 : 0).toFixed(1)),
    };
}

export async function GET(request: Request) {
    const auth = await authorize(request, "dashboard.view");
    if (!auth.ok) return auth.response;
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get("period") ?? "month";
        const years = parseInt(searchParams.get("years") ?? "2", 10);
        const reqYear = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : undefined;
        const reqMonth = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) : undefined;

        const [start, end] = getDateRange(period, years, reqYear, reqMonth);

        // Fetch raw rows in date range in parallel
        const comparison = comparisonRange(period, start, end);
        const [salesRows, expensesRows, customerRows, previousKpis] = await Promise.all([
            db
                .select()
                .from(sales)
                .where(and(gte(sales.sale_date, start), lte(sales.sale_date, end), postedSale)),
            db
                .select()
                .from(expenses)
                .where(and(gte(expenses.expense_date, start), lte(expenses.expense_date, end), postedExpense)),
            db.select({ customer_id: customers.customer_id, customer_name: customers.customer_name }).from(customers),
            comparison ? totalsBetween(comparison.range) : Promise.resolve(null),
        ]);

        const labelFn = getLabelFn(period);
        const labels = buildLabels(period, start, end);

        // Aggregate totals per bucket
        const salesMap = aggregateByLabel(
            salesRows,
            (r) => r.sale_date,
            labelFn,
            (r) => r.grand_total ?? 0
        );
        const expensesMap = aggregateByLabel(
            expensesRows,
            (r) => r.expense_date,
            labelFn,
            (r) => r.total ?? 0
        );

        // Build chart data — every label guaranteed to appear (zeros for empty buckets)
        const chartData = labels.map((label) => {
            const s = salesMap.get(label) ?? 0;
            const e = expensesMap.get(label) ?? 0;
            return {
                label,
                sales: parseFloat(s.toFixed(2)),
                expenses: parseFloat(e.toFixed(2)),
                profit: parseFloat((s - e).toFixed(2)),
            };
        });

        // KPI totals
        const totalSales = salesRows.reduce((acc, r) => acc + (r.grand_total ?? 0), 0);
        const totalExpenses = expensesRows.reduce((acc, r) => acc + (r.total ?? 0), 0);
        const netProfit = totalSales - totalExpenses;
        const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

        // Expense breakdown by category (top 8)
        const expenseCategoryMap = new Map<string, number>();
        for (const r of expensesRows) {
            // Expenses created by returns are named after the product; show them as one category
            const name = r.expense_name ? expenseCategoryOf(r.expense_name) : "Other";
            expenseCategoryMap.set(name, (expenseCategoryMap.get(name) ?? 0) + (r.total ?? 0));
        }
        const expenseBreakdown = Array.from(expenseCategoryMap.entries())
            .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        // Top customers by revenue (top 10), by customer (under their current name) so a renamed customer counts once
        const currentNames = new Map(customerRows.map((c) => [Number(c.customer_id), c.customer_name]));
        const customerMap = new Map<string, { name: string; total: number }>();
        for (const r of salesRows) {
            const key = r.customer_id ? `id:${r.customer_id}` : `name:${r.customer_name}`;
            const name = (r.customer_id && currentNames.get(Number(r.customer_id))) || r.customer_name || "Unknown";
            const entry = customerMap.get(key) ?? { name, total: 0 };
            entry.total += r.grand_total ?? 0;
            customerMap.set(key, entry);
        }
        const topCustomers = Array.from(customerMap.values())
            .map(({ name, total }) => ({ name, total: parseFloat(total.toFixed(2)) }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // FIX: always send no-cache headers so browser/Next.js never serves stale data
        return NextResponse.json(
            {
                period,
                chartData,
                kpis: {
                    totalSales: parseFloat(totalSales.toFixed(2)),
                    totalExpenses: parseFloat(totalExpenses.toFixed(2)),
                    netProfit: parseFloat(netProfit.toFixed(2)),
                    profitMargin: parseFloat(profitMargin.toFixed(1)),
                },
                expenseBreakdown,
                topCustomers,
                uniqueCustomers: customerMap.size,
                // The same figures for the period this one is compared with (null for the multi-year view)
                comparison: comparison && previousKpis
                    ? { ...comparison.range, label: comparison.label, kpis: previousKpis }
                    : null,
            },
            {
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                    Pragma: "no-cache",
                },
            }
        );
    } catch (error) {
        console.error("Dashboard summary error:", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json(
            { error: message },
            {
                status,
                headers: { "Cache-Control": "no-store" },
            }
        );
    }
}
