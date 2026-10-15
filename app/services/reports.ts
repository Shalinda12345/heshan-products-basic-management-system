// Figures for the reports pages. Every figure counts posted documents only (voided invoices and expenses are left out).
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, expenses, products, returns, sales, sale_items, stocks } from "../db/schema";
import { parseLocalDate, toIsoDate } from "../lib/dates";
import { MONTH_ABBR } from "../lib/format";
import { roundMoney } from "../lib/money";
import { addDays, daysBetween, describeRange, previousPeriod, type DateRange } from "../lib/periods";
import { lowStockLevel, stockStatus } from "../lib/stock";
import { postedExpense } from "./expenses";
import { postedReturn } from "./returns";
import { postedSale } from "./sales";

// Expenses created by returns are named after the product ("Stock Expense Return: Yogurt"); report them as one category
export const RETURNS_CATEGORY = "Returns & write-offs";

export function expenseCategoryOf(expenseName: string): string {
    return /^(Stock Expense Return|Sale Reduction Expense Return):/.test(expenseName) ? RETURNS_CATEGORY : expenseName;
}

// Adds up rows grouped by expense name into report categories (return write-offs folded into one)
function foldCategories<T extends { name: string }>(rows: T[], numeric: (keyof T)[]): T[] {
    const folded = new Map<string, T>();
    for (const row of rows) {
        const name = expenseCategoryOf(row.name);
        const into = folded.get(name);
        if (!into) {
            folded.set(name, { ...row, name });
            continue;
        }
        for (const key of numeric) (into[key] as number) = Number(into[key]) + Number(row[key]);
    }
    return [...folded.values()];
}

// Invoice lines group by product; lines from before products were linked group by their name
export const productKey = sql<string>`COALESCE(CONCAT('id:', ${sale_items.product_id}), CONCAT('name:', ${sale_items.product_name}))`;
const customerKey = sql<string>`COALESCE(CONCAT('id:', ${sales.customer_id}), CONCAT('name:', ${sales.customer_name}))`;

function between(column: typeof sales.sale_date | typeof expenses.expense_date | typeof returns.return_date, range: DateRange) {
    return and(gte(column, parseLocalDate(range.from)), lte(column, parseLocalDate(range.to)));
}

// `part` as a percentage of `whole`, to one decimal place
const percentOf = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;

// Percentage change from `previous` (null when there is nothing to compare with)
function change(current: number, previous: number): number | null {
    return previous ? percentOf(current - previous, Math.abs(previous)) : null;
}

const money = (value: unknown) => roundMoney(Number(value ?? 0));

export function periodInfo(range: DateRange) {
    const previous = previousPeriod(range);
    return {
        period: { ...range, label: describeRange(range) },
        previous: { ...previous, label: describeRange(previous) },
    };
}

// The 12 calendar months ending with the month of `to`
function last12Months(to: string): { key: string; label: string; from: string; to: string }[] {
    const end = parseLocalDate(to);
    return Array.from({ length: 12 }, (_, i) => {
        const start = new Date(end.getFullYear(), end.getMonth() - 11 + i, 1);
        const last = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        return {
            key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
            label: `${MONTH_ABBR[start.getMonth()]} ${start.getFullYear()}`,
            from: toIsoDate(start),
            to: toIsoDate(last),
        };
    });
}

// ─── Overview (profit & loss) ─────────────────────────────────────────────────

async function periodTotals(range: DateRange) {
    const [[sale], [expense], [units], [ret]] = await Promise.all([
        db.select({
            revenue: sql<number>`COALESCE(SUM(${sales.grand_total}), 0)`,
            invoices: sql<number>`COUNT(*)`,
            customers: sql<number>`COUNT(DISTINCT ${customerKey})`,
        }).from(sales).where(and(between(sales.sale_date, range), postedSale)),
        db.select({ total: sql<number>`COALESCE(SUM(${expenses.total}), 0)` })
            .from(expenses).where(and(between(expenses.expense_date, range), postedExpense)),
        db.select({ units: sql<number>`COALESCE(SUM(${sale_items.quantity}), 0)` })
            .from(sale_items).innerJoin(sales, eq(sales.sale_id, sale_items.sale_id))
            .where(and(between(sales.sale_date, range), postedSale)),
        // Returns taken off invoices that still count (a voided invoice is out of every total, returns and all)
        db.select({ value: sql<number>`COALESCE(SUM(${returns.total}), 0)`, count: sql<number>`COUNT(*)` })
            .from(returns)
            .innerJoin(sales, eq(sales.sale_id, returns.sale_id))
            .where(and(between(returns.return_date, range), postedReturn, postedSale,
                inArray(returns.return_type, ["sale_reduction_return", "sale_reduction_expense_return"]))),
    ]);
    const revenue = money(sale.revenue);
    const totalExpenses = money(expense.total);
    const invoices = Number(sale.invoices);
    const profit = roundMoney(revenue - totalExpenses);
    return {
        revenue,
        expenses: totalExpenses,
        profit,
        margin: revenue > 0 ? percentOf(profit, revenue) : null,
        invoices,
        avg_invoice: invoices > 0 ? roundMoney(revenue / invoices) : 0,
        customers: Number(sale.customers),
        units_sold: Number(units.units),
        returns_value: money(ret.value),
        returns_count: Number(ret.count),
    };
}

export async function overviewReport(range: DateRange) {
    const info = periodInfo(range);
    const months = last12Months(range.to);
    const trendRange = { from: months[0].from, to: months[11].to };
    const monthOf = (column: typeof sales.sale_date | typeof expenses.expense_date) => sql<string>`DATE_FORMAT(${column}, '%Y-%m')`;

    const [current, prior, monthlySales, monthlyExpenses, categoryRows] = await Promise.all([
        periodTotals(range),
        periodTotals(info.previous),
        db.select({ month: monthOf(sales.sale_date), total: sql<number>`SUM(${sales.grand_total})` })
            .from(sales).where(and(between(sales.sale_date, trendRange), postedSale)).groupBy(monthOf(sales.sale_date)),
        db.select({ month: monthOf(expenses.expense_date), total: sql<number>`SUM(${expenses.total})` })
            .from(expenses).where(and(between(expenses.expense_date, trendRange), postedExpense)).groupBy(monthOf(expenses.expense_date)),
        db.select({
            name: expenses.expense_name,
            current: sql<number>`SUM(CASE WHEN ${expenses.expense_date} BETWEEN ${range.from} AND ${range.to} THEN ${expenses.total} ELSE 0 END)`,
            previous: sql<number>`SUM(CASE WHEN ${expenses.expense_date} BETWEEN ${info.previous.from} AND ${info.previous.to} THEN ${expenses.total} ELSE 0 END)`,
        })
            .from(expenses)
            .where(and(between(expenses.expense_date, { from: info.previous.from, to: range.to }), postedExpense))
            .groupBy(expenses.expense_name)
            .then((rows) => foldCategories(rows, ["current", "previous"])),
    ]);

    const salesByMonth = new Map(monthlySales.map((r) => [r.month, money(r.total)]));
    const expensesByMonth = new Map(monthlyExpenses.map((r) => [r.month, money(r.total)]));

    return {
        ...info,
        current,
        prior,
        changes: {
            revenue: change(current.revenue, prior.revenue),
            expenses: change(current.expenses, prior.expenses),
            // Percent only between two profits; a swing into or out of a loss is shown in rupees instead
            profit: current.profit >= 0 && prior.profit > 0 ? change(current.profit, prior.profit) : null,
            invoices: change(current.invoices, prior.invoices),
            avg_invoice: change(current.avg_invoice, prior.avg_invoice),
            customers: change(current.customers, prior.customers),
            units_sold: change(current.units_sold, prior.units_sold),
        },
        monthly: months.map((m) => {
            const revenue = salesByMonth.get(m.key) ?? 0;
            const spent = expensesByMonth.get(m.key) ?? 0;
            return { month: m.key, label: m.label, revenue, expenses: spent, profit: roundMoney(revenue - spent) };
        }),
        expense_categories: categoryRows
            .map((r) => ({ name: r.name, current: money(r.current), previous: money(r.previous), change: change(money(r.current), money(r.previous)) }))
            .filter((r) => r.current > 0 || r.previous > 0)
            .sort((a, b) => b.current - a.current || b.previous - a.previous || a.name.localeCompare(b.name)),
    };
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function productsReport(range: DateRange) {
    const info = periodInfo(range);
    const lines = (period: DateRange) => db
        .select({
            key: productKey,
            product_id: sql<number | null>`MAX(${sale_items.product_id})`,
            product_name: sql<string>`MAX(${sale_items.product_name})`,
            units: sql<number>`SUM(${sale_items.quantity})`,
            revenue: sql<number>`SUM(${sale_items.total})`,
            invoices: sql<number>`COUNT(DISTINCT ${sale_items.sale_id})`,
        })
        .from(sale_items)
        .innerJoin(sales, eq(sales.sale_id, sale_items.sale_id))
        .where(and(between(sales.sale_date, period), postedSale))
        .groupBy(productKey);

    const [current, previous, catalogue] = await Promise.all([
        lines(range),
        lines(info.previous),
        db.select({
            product_id: products.product_id,
            product_name: products.product_name,
            unit_cost: products.unit_cost,
            unit_price: products.unit_price,
            is_active: products.is_active,
            on_hand: stocks.quantity,
        }).from(products).leftJoin(stocks, eq(stocks.product_id, products.product_id)),
    ]);

    const byKey = new Map<string, { product_id: number | null; product_name: string; is_active: boolean; unit_cost: number | null; on_hand: number | null }>();
    for (const p of catalogue) {
        byKey.set(`id:${p.product_id}`, {
            product_id: Number(p.product_id),
            product_name: p.product_name,
            is_active: p.is_active,
            unit_cost: p.unit_cost === null ? null : Number(p.unit_cost),
            on_hand: p.on_hand === null ? 0 : Number(p.on_hand),
        });
    }
    const prevByKey = new Map(previous.map((r) => [r.key, r]));
    const curByKey = new Map(current.map((r) => [r.key, r]));

    // Every product that sold in either period, plus active products that sold nothing
    const keys = new Set<string>([...curByKey.keys(), ...prevByKey.keys()]);
    for (const [key, p] of byKey) if (p.is_active) keys.add(key);

    const totalRevenue = current.reduce((sum, r) => sum + Number(r.revenue), 0);
    const rows = [...keys].map((key) => {
        const cur = curByKey.get(key);
        const prev = prevByKey.get(key);
        const product = byKey.get(key);
        const units = Number(cur?.units ?? 0);
        const revenue = money(cur?.revenue);
        const prevRevenue = money(prev?.revenue);
        const unitCost = product?.unit_cost ?? null;
        const estCost = unitCost !== null ? roundMoney(units * unitCost) : null;
        const estProfit = estCost !== null ? roundMoney(revenue - estCost) : null;
        return {
            product_id: product?.product_id ?? null,
            product_name: product?.product_name ?? cur?.product_name ?? prev?.product_name ?? key,
            is_active: product?.is_active ?? false,
            units,
            revenue,
            invoices: Number(cur?.invoices ?? 0),
            avg_price: units > 0 ? roundMoney(revenue / units) : null,
            share: totalRevenue > 0 ? percentOf(revenue, totalRevenue) : 0,
            prev_units: Number(prev?.units ?? 0),
            prev_revenue: prevRevenue,
            change: change(revenue, prevRevenue),
            unit_cost: unitCost,
            est_cost: estCost,
            est_profit: estProfit,
            est_margin: estProfit !== null && revenue > 0 ? percentOf(estProfit, revenue) : null,
            on_hand: product?.on_hand ?? null,
        };
    }).sort((a, b) => b.revenue - a.revenue || b.prev_revenue - a.prev_revenue || a.product_name.localeCompare(b.product_name));

    const costed = rows.filter((r) => r.est_profit !== null);
    return {
        ...info,
        rows,
        totals: {
            units: rows.reduce((sum, r) => sum + r.units, 0),
            revenue: roundMoney(totalRevenue),
            prev_revenue: roundMoney(rows.reduce((sum, r) => sum + r.prev_revenue, 0)),
            est_profit: costed.length ? roundMoney(costed.reduce((sum, r) => sum + (r.est_profit ?? 0), 0)) : null,
            // Share of revenue from products with a unit cost, i.e. how much of the margin estimate is covered
            cost_coverage: totalRevenue > 0 ? percentOf(costed.reduce((sum, r) => sum + r.revenue, 0), totalRevenue) : null,
            not_selling: rows.filter((r) => r.is_active && r.units === 0).length,
        },
    };
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function customersReport(range: DateRange, today = new Date()) {
    const info = periodInfo(range);
    const totals = (period: DateRange) => db
        .select({
            key: customerKey,
            customer_name: sql<string>`MAX(${sales.customer_name})`,
            revenue: sql<number>`SUM(${sales.grand_total})`,
            invoices: sql<number>`COUNT(*)`,
        })
        .from(sales)
        .where(and(between(sales.sale_date, period), postedSale))
        .groupBy(customerKey);

    const [current, previous, allTime, list] = await Promise.all([
        totals(range),
        totals(info.previous),
        db.select({
            key: customerKey,
            first_purchase: sql<string>`DATE_FORMAT(MIN(${sales.sale_date}), '%Y-%m-%d')`,
            last_purchase: sql<string>`DATE_FORMAT(MAX(${sales.sale_date}), '%Y-%m-%d')`,
        }).from(sales).where(postedSale).groupBy(customerKey),
        db.select().from(customers),
    ]);

    const curByKey = new Map(current.map((r) => [r.key, r]));
    const prevByKey = new Map(previous.map((r) => [r.key, r]));
    const historyByKey = new Map(allTime.map((r) => [r.key, r]));
    const listByKey = new Map(list.map((c) => [`id:${c.customer_id}`, c]));

    const keys = new Set<string>([...curByKey.keys(), ...prevByKey.keys()]);
    for (const [key, c] of listByKey) if (c.is_active) keys.add(key);

    const totalRevenue = current.reduce((sum, r) => sum + Number(r.revenue), 0);
    const todayIso = toIsoDate(today);
    // Negative for an invoice dated in the future (usually a typing mistake worth checking)
    const daysSince = (date: string | null | undefined) => (date ? daysBetween(parseLocalDate(date), parseLocalDate(todayIso)) : null);

    const rows = [...keys].map((key) => {
        const cur = curByKey.get(key);
        const prev = prevByKey.get(key);
        const listed = listByKey.get(key);
        const history = historyByKey.get(key);
        const revenue = money(cur?.revenue);
        const invoices = Number(cur?.invoices ?? 0);
        const prevRevenue = money(prev?.revenue);
        return {
            customer_id: listed ? Number(listed.customer_id) : null,
            customer_name: listed?.customer_name ?? cur?.customer_name ?? prev?.customer_name ?? key,
            is_active: listed?.is_active ?? false,
            revenue,
            invoices,
            avg_invoice: invoices > 0 ? roundMoney(revenue / invoices) : null,
            share: totalRevenue > 0 ? percentOf(revenue, totalRevenue) : 0,
            prev_revenue: prevRevenue,
            change: change(revenue, prevRevenue),
            first_purchase: history?.first_purchase ?? null,
            last_purchase: history?.last_purchase ?? null,
            days_since_last_purchase: daysSince(history?.last_purchase),
            is_new: !!history?.first_purchase && history.first_purchase >= range.from && history.first_purchase <= range.to,
        };
    }).sort((a, b) => b.revenue - a.revenue || b.prev_revenue - a.prev_revenue || a.customer_name.localeCompare(b.customer_name));

    const buying = rows.filter((r) => r.revenue > 0);
    const top5 = buying.slice(0, 5).reduce((sum, r) => sum + r.revenue, 0);
    return {
        ...info,
        rows,
        totals: {
            revenue: roundMoney(totalRevenue),
            prev_revenue: roundMoney(rows.reduce((sum, r) => sum + r.prev_revenue, 0)),
            customers_buying: buying.length,
            prev_customers_buying: rows.filter((r) => r.prev_revenue > 0).length,
            new_customers: rows.filter((r) => r.is_new).length,
            // Bought in the previous period but not in this one
            lapsed_customers: rows.filter((r) => r.prev_revenue > 0 && r.revenue === 0).length,
            top5_share: totalRevenue > 0 ? percentOf(top5, totalRevenue) : null,
            // How much depends on the single biggest customer
            top_customer: buying[0] ? { name: buying[0].customer_name, share: buying[0].share } : null,
        },
    };
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function expensesReport(range: DateRange) {
    const info = periodInfo(range);
    const months = last12Months(range.to);
    const monthOf = sql<string>`DATE_FORMAT(${expenses.expense_date}, '%Y-%m')`;

    const [categories, employeesRows, monthly] = await Promise.all([
        db.select({
            name: expenses.expense_name,
            current: sql<number>`SUM(CASE WHEN ${expenses.expense_date} BETWEEN ${range.from} AND ${range.to} THEN ${expenses.total} ELSE 0 END)`,
            count: sql<number>`SUM(CASE WHEN ${expenses.expense_date} BETWEEN ${range.from} AND ${range.to} THEN 1 ELSE 0 END)`,
            previous: sql<number>`SUM(CASE WHEN ${expenses.expense_date} BETWEEN ${info.previous.from} AND ${info.previous.to} THEN ${expenses.total} ELSE 0 END)`,
        })
            .from(expenses)
            .where(and(between(expenses.expense_date, { from: info.previous.from, to: range.to }), postedExpense))
            .groupBy(expenses.expense_name)
            .then((rows) => foldCategories(rows, ["current", "count", "previous"])),
        db.select({
            employee_name: expenses.employee_name,
            category: expenses.expense_name,
            total: sql<number>`SUM(${expenses.total})`,
        })
            .from(expenses)
            .where(and(between(expenses.expense_date, range), postedExpense, sql`${expenses.employee_name} IS NOT NULL`))
            .groupBy(expenses.employee_name, expenses.expense_name),
        db.select({ month: monthOf, total: sql<number>`SUM(${expenses.total})` })
            .from(expenses)
            .where(and(between(expenses.expense_date, { from: months[0].from, to: months[11].to }), postedExpense))
            .groupBy(monthOf),
    ]);

    const total = categories.reduce((sum, r) => sum + Number(r.current), 0);
    const prevTotal = categories.reduce((sum, r) => sum + Number(r.previous), 0);

    const people = new Map<string, { employee_name: string; total: number; by_category: Record<string, number> }>();
    for (const row of employeesRows) {
        const name = row.employee_name ?? "";
        const person = people.get(name) ?? { employee_name: name, total: 0, by_category: {} };
        person.by_category[row.category] = money(row.total);
        person.total = roundMoney(person.total + Number(row.total));
        people.set(name, person);
    }
    const byMonth = new Map(monthly.map((r) => [r.month, money(r.total)]));

    return {
        ...info,
        categories: categories
            .map((r) => ({
                name: r.name,
                total: money(r.current),
                count: Number(r.count),
                share: total > 0 ? percentOf(Number(r.current), total) : 0,
                prev_total: money(r.previous),
                change: change(money(r.current), money(r.previous)),
            }))
            .filter((r) => r.total > 0 || r.prev_total > 0)
            .sort((a, b) => b.total - a.total || b.prev_total - a.prev_total || a.name.localeCompare(b.name)),
        employees: [...people.values()].sort((a, b) => b.total - a.total || a.employee_name.localeCompare(b.employee_name)),
        monthly: months.map((m) => ({ month: m.key, label: m.label, total: byMonth.get(m.key) ?? 0 })),
        totals: { total: roundMoney(total), prev_total: roundMoney(prevTotal), change: change(roundMoney(total), roundMoney(prevTotal)) },
    };
}

// ─── Stock health ─────────────────────────────────────────────────────────────

export const STOCK_WINDOW_DAYS = 30;
export const DEAD_STOCK_DAYS = 60;

export async function stockReport(today = new Date()) {
    const end = toIsoDate(today);
    const window = { from: toIsoDate(addDays(today, -(STOCK_WINDOW_DAYS - 1))), to: end };

    const [catalogue, recent, lastSales] = await Promise.all([
        db.select({
            product_id: products.product_id,
            product_name: products.product_name,
            unit_cost: products.unit_cost,
            unit_price: products.unit_price,
            reorder_level: products.reorder_level,
            is_active: products.is_active,
            on_hand: stocks.quantity,
        }).from(products).leftJoin(stocks, eq(stocks.product_id, products.product_id)),
        db.select({ product_id: sale_items.product_id, units: sql<number>`SUM(${sale_items.quantity})` })
            .from(sale_items).innerJoin(sales, eq(sales.sale_id, sale_items.sale_id))
            .where(and(between(sales.sale_date, window), postedSale, sql`${sale_items.product_id} IS NOT NULL`))
            .groupBy(sale_items.product_id),
        db.select({ product_id: sale_items.product_id, last_sale: sql<string>`DATE_FORMAT(MAX(${sales.sale_date}), '%Y-%m-%d')` })
            .from(sale_items).innerJoin(sales, eq(sales.sale_id, sale_items.sale_id))
            .where(and(postedSale, sql`${sale_items.product_id} IS NOT NULL`, sql`${sale_items.quantity} > 0`))
            .groupBy(sale_items.product_id),
    ]);

    const soldById = new Map(recent.map((r) => [Number(r.product_id), Number(r.units)]));
    const lastById = new Map(lastSales.map((r) => [Number(r.product_id), r.last_sale]));
    const todayDate = parseLocalDate(end);

    const rows = catalogue
        .map((p) => {
            const id = Number(p.product_id);
            const onHand = p.on_hand === null ? 0 : Number(p.on_hand);
            const reorder = p.reorder_level === null ? null : Number(p.reorder_level);
            const cost = p.unit_cost === null ? null : Number(p.unit_cost);
            const price = p.unit_price === null ? null : Number(p.unit_price);
            const sold = soldById.get(id) ?? 0;
            const perDay = sold / STOCK_WINDOW_DAYS;
            const lastSale = lastById.get(id) ?? null;
            const idleDays = lastSale ? daysBetween(parseLocalDate(lastSale), todayDate) : null;
            return {
                product_id: id,
                product_name: p.product_name,
                is_active: p.is_active,
                on_hand: onHand,
                reorder_level: lowStockLevel(reorder),
                status: stockStatus(onHand, reorder),
                unit_cost: cost,
                unit_price: price,
                stock_value: cost !== null ? roundMoney(Math.max(onHand, 0) * cost) : null,
                retail_value: price !== null ? roundMoney(Math.max(onHand, 0) * price) : null,
                sold_30d: sold,
                avg_daily: Math.round(perDay * 100) / 100,
                // How many days the stock lasts at the recent selling rate (null: not selling)
                days_of_cover: sold > 0 ? Math.floor((Math.max(onHand, 0) * STOCK_WINDOW_DAYS) / sold) : null,
                last_sale: lastSale,
                // Stock on hand that hasn't sold for DEAD_STOCK_DAYS (or ever)
                slow_moving: onHand > 0 && (idleDays === null || idleDays >= DEAD_STOCK_DAYS),
            };
        })
        .filter((r) => r.is_active || r.on_hand !== 0)
        .sort((a, b) => {
            const rank = { out: 0, low: 1, ok: 2 } as const;
            return rank[a.status] - rank[b.status] || (a.days_of_cover ?? Infinity) - (b.days_of_cover ?? Infinity) || a.product_name.localeCompare(b.product_name);
        });

    return {
        window,
        rows,
        totals: {
            stock_value: roundMoney(rows.reduce((sum, r) => sum + (r.stock_value ?? 0), 0)),
            retail_value: roundMoney(rows.reduce((sum, r) => sum + (r.retail_value ?? 0), 0)),
            products_out: rows.filter((r) => r.status === "out").length,
            products_low: rows.filter((r) => r.status === "low").length,
            slow_moving: rows.filter((r) => r.slow_moving).length,
            missing_cost: rows.filter((r) => r.on_hand > 0 && r.unit_cost === null).length,
        },
    };
}
