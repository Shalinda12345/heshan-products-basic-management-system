import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { customers, sales, expenses } from "@/app/db/schema";
import { and, gte, lte, sql } from "drizzle-orm";
import { RequestError, readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { endOfDay, isoDateFromDb, parseLocalDate, startOfDay, toIsoDate } from "@/app/lib/dates";
import { MONTH_ABBR } from "@/app/lib/format";
import { addDays, previousPeriod, samePeriodBefore, weekContaining, type DateRange } from "@/app/lib/periods";
import { intParam, yearMonthParams } from "@/app/lib/validation";
import { postedSale } from "@/app/services/sales";
import { postedExpense } from "@/app/services/expenses";
import { expenseCategoryOf } from "@/app/services/reports";

export const dynamic = "force-dynamic";

const PERIODS = ["day", "week", "month", "year", "multi"];

const round2 = (n: number) => parseFloat(n.toFixed(2));

// The dates the selected period covers: today, this week up to today, a month, a year, or 2-10 whole years
function getDateRange(period: string, years: number, selectedYear?: number, selectedMonth?: number): [Date, Date] {
    const now = new Date();

    if (period === "day") return [startOfDay(now), endOfDay(now)];
    if (period === "week") return [weekContaining(now).start, endOfDay(now)];

    if (period === "month") {
        const yr = selectedYear ?? now.getFullYear();
        const mo = selectedMonth ? selectedMonth - 1 : now.getMonth();
        return [new Date(yr, mo, 1), endOfDay(new Date(yr, mo + 1, 0))];
    }

    const lastYear = selectedYear ?? now.getFullYear();
    const firstYear = period === "year" ? lastYear : lastYear - Math.max(2, Math.min(years, 10)) + 1;
    return [new Date(firstYear, 0, 1), endOfDay(new Date(lastYear, 11, 31))];
}

const dayLabel = (d: Date) => `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
const monthYearLabel = (d: Date) => `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;

// The chart's buckets for a period: the label of each, and the label a date falls under
function chartBuckets(period: string, start: Date, end: Date): { labels: string[]; labelOf: (d: Date) => string } {
    const each = (step: (d: Date) => Date) => {
        const dates: Date[] = [];
        for (let d = start; d <= end; d = step(d)) dates.push(d);
        return dates;
    };
    const days = () => each((d) => addDays(d, 1));
    const months = () => each((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

    // Sales and expenses are dated by day, so "today" is a single bucket
    if (period === "day") return { labels: [dayLabel(start)], labelOf: dayLabel };
    if (period === "week") return { labels: days().map(dayLabel), labelOf: dayLabel };
    if (period === "month") {
        const labelOf = (d: Date) => String(d.getDate());
        return { labels: days().map(labelOf), labelOf };
    }
    if (period === "year") {
        const labelOf = (d: Date) => MONTH_ABBR[d.getMonth()];
        return { labels: months().map(labelOf), labelOf };
    }
    return { labels: months().map(monthYearLabel), labelOf: monthYearLabel };
}

// Adds up `value` per chart bucket
function totalsByLabel<T>(rows: T[], dateOf: (row: T) => Date | string, labelOf: (d: Date) => string, value: (row: T) => number) {
    const totals = new Map<string, number>();
    for (const row of rows) {
        const label = labelOf(parseLocalDate(isoDateFromDb(dateOf(row))));
        totals.set(label, (totals.get(label) ?? 0) + value(row));
    }
    return totals;
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
    const names = { day: "yesterday", week: "the same days last week", month: "last month", year: "last year" } as const;
    const label = inProgress && unit !== "day"
        ? (unit === "week" ? `vs ${names.week}` : `vs the same days ${names[unit]}`)
        : `vs ${unit === "day" ? names.day : `the previous ${unit}`}`;
    // A finished month or year is compared with the whole one before it
    const finished = !inProgress && (unit === "month" || unit === "year");
    return { range: finished ? previousPeriod(span) : samePeriodBefore(span, unit), label };
}

function kpisOf(totalSales: number, totalExpenses: number) {
    const netProfit = totalSales - totalExpenses;
    return {
        totalSales: round2(totalSales),
        totalExpenses: round2(totalExpenses),
        netProfit: round2(netProfit),
        profitMargin: parseFloat((totalSales > 0 ? (netProfit / totalSales) * 100 : 0).toFixed(1)),
    };
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
    return kpisOf(Number(salesTotal.total), Number(expenseTotal.total));
}

export async function GET(request: Request) {
    const auth = await authorize(request, "dashboard.view");
    if (!auth.ok) return auth.response;
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get("period") || "month";
        if (!PERIODS.includes(period)) throw new RequestError(`Invalid parameter: period must be one of ${PERIODS.join(", ")}`);
        // The multi-year view covers 2 to 10 years
        const years = intParam(searchParams, "years", 0, 100) ?? 2;
        const { year: reqYear, month: reqMonth } = yearMonthParams(searchParams);

        const [start, end] = getDateRange(period, years, reqYear ?? undefined, reqMonth ?? undefined);
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
            comparison ? totalsBetween(comparison.range) : null,
        ]);

        // Every bucket appears in the chart, with zeros when nothing happened in it
        const { labels, labelOf } = chartBuckets(period, start, end);
        const salesMap = totalsByLabel(salesRows, (r) => r.sale_date, labelOf, (r) => r.grand_total ?? 0);
        const expensesMap = totalsByLabel(expensesRows, (r) => r.expense_date, labelOf, (r) => r.total ?? 0);
        const chartData = labels.map((label) => {
            const s = salesMap.get(label) ?? 0;
            const e = expensesMap.get(label) ?? 0;
            return { label, sales: round2(s), expenses: round2(e), profit: round2(s - e) };
        });

        const totalSales = salesRows.reduce((acc, r) => acc + (r.grand_total ?? 0), 0);
        const totalExpenses = expensesRows.reduce((acc, r) => acc + (r.total ?? 0), 0);

        // Expense breakdown by category (top 8)
        const expenseCategoryMap = new Map<string, number>();
        for (const r of expensesRows) {
            // Expenses created by returns are named after the product; show them as one category
            const name = r.expense_name ? expenseCategoryOf(r.expense_name) : "Other";
            expenseCategoryMap.set(name, (expenseCategoryMap.get(name) ?? 0) + (r.total ?? 0));
        }
        const expenseBreakdown = Array.from(expenseCategoryMap.entries())
            .map(([name, value]) => ({ name, value: round2(value) }))
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
            .map(({ name, total }) => ({ name, total: round2(total) }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        return NextResponse.json(
            {
                period,
                chartData,
                kpis: kpisOf(totalSales, totalExpenses),
                expenseBreakdown,
                topCustomers,
                uniqueCustomers: customerMap.size,
                // The same figures for the period this one is compared with (null for the multi-year view)
                comparison: comparison && previousKpis
                    ? { ...comparison.range, label: comparison.label, kpis: previousKpis }
                    : null,
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return readErrorJson(error, "Dashboard summary error:");
    }
}
