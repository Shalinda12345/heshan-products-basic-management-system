import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { products, sales, sale_items } from "@/app/db/schema";
import { and, gte, lte, eq, sql, desc } from "drizzle-orm";
import { RequestError, readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { endOfDay, parseLocalDate, startOfDay, toIsoDate } from "@/app/lib/dates";
import { MONTH_NAMES, formatDate } from "@/app/lib/format";
import { describeRange, weekContaining } from "@/app/lib/periods";
import { dateParam, yearMonthParams } from "@/app/lib/validation";
import { productKey } from "@/app/services/reports";
import { postedSale } from "@/app/services/sales";

export const dynamic = "force-dynamic";

const TIMEFRAMES = ["daily", "day", "weekly", "week", "monthly", "month", "custom"];

// "12 Oct – 18 Oct 2026" (written the same way whatever the server's locale)
const rangeLabel = (start: Date, end: Date) => describeRange({ from: toIsoDate(start), to: toIsoDate(end) });

// A whole month (0-11), from local midnight on the 1st to the end of its last day
function monthRange(year: number, month: number) {
    const start = new Date(year, month, 1);
    return { start, end: endOfDay(new Date(year, month + 1, 0)), label: `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}` };
}

// The dates a timeframe covers, as local times for comparing with DATE columns, and how to describe them.
// A day or week is the one containing ?date= (or the 1st of ?year=&month=, or today); a custom timeframe is
// ?startDate= to ?endDate=, else the month in ?year=&month=, else this month.
function getDateRange(
    timeframe: string,
    params: {
        year?: number | null;
        month?: number | null;
        startDate?: string | null;
        endDate?: string | null;
        date?: string | null;
    }
): { start: Date; end: Date; label: string } {
    const now = new Date();
    const base = params.date
        ? parseLocalDate(params.date)
        : params.year && params.month ? new Date(params.year, params.month - 1, 1) : now;

    if (timeframe === "daily" || timeframe === "day") {
        const start = startOfDay(base);
        return { start, end: endOfDay(base), label: formatDate(start) };
    }

    if (timeframe === "weekly" || timeframe === "week") {
        const { start, end } = weekContaining(base);
        return { start, end: endOfDay(end), label: rangeLabel(start, end) };
    }

    if (timeframe === "monthly" || timeframe === "month") {
        return monthRange(params.year ?? now.getFullYear(), params.month ? params.month - 1 : now.getMonth());
    }

    if (params.startDate && params.endDate) {
        const start = startOfDay(parseLocalDate(params.startDate));
        const end = endOfDay(parseLocalDate(params.endDate));
        return { start, end, label: rangeLabel(start, end) };
    }
    if (params.year && params.month) return monthRange(params.year, params.month - 1);
    return monthRange(now.getFullYear(), now.getMonth());
}

export async function GET(request: Request) {
    const auth = await authorize(request, "sales.view");
    if (!auth.ok) return auth.response;
    try {
        const { searchParams } = new URL(request.url);
        const timeframe = (searchParams.get("timeframe") || searchParams.get("period") || "daily").toLowerCase();
        if (!TIMEFRAMES.includes(timeframe)) throw new RequestError("Invalid parameter: timeframe must be daily, weekly, monthly or custom");
        const { year, month } = yearMonthParams(searchParams);
        const startDate = dateParam(searchParams, "startDate");
        const endDate = dateParam(searchParams, "endDate");
        const date = dateParam(searchParams, "date");
        if (startDate && endDate && startDate > endDate) throw new RequestError("Invalid parameters: startDate must not be after endDate");

        const { start, end, label } = getDateRange(timeframe, {
            year,
            month,
            startDate,
            endDate,
            date,
        });

        // Units and revenue per product in the period. A renamed product keeps one row (under its current name).
        const rawItems = await db
            .select({
                product_name: sql<string>`MAX(COALESCE(${products.product_name}, ${sale_items.product_name}))`,
                total_quantity: sql<number>`COALESCE(SUM(${sale_items.quantity}), 0)`,
                total_revenue: sql<number>`COALESCE(SUM(${sale_items.total}), 0)`,
                orders_count: sql<number>`COUNT(DISTINCT ${sale_items.sale_id})`,
                avg_price: sql<number>`COALESCE(AVG(${sale_items.selling_price}), 0)`,
                min_price: sql<number>`COALESCE(MIN(${sale_items.selling_price}), 0)`,
                max_price: sql<number>`COALESCE(MAX(${sale_items.selling_price}), 0)`,
            })
            .from(sale_items)
            .innerJoin(sales, eq(sale_items.sale_id, sales.sale_id))
            .leftJoin(products, eq(products.product_id, sale_items.product_id))
            .where(
                and(
                    gte(sales.sale_date, start),
                    lte(sales.sale_date, end),
                    postedSale
                )
            )
            .groupBy(productKey)
            .orderBy(desc(sql`SUM(${sale_items.quantity})`));

        const items = rawItems.map((item) => ({
            product_name: item.product_name,
            quantity: Number(item.total_quantity) || 0,
            revenue: Number(item.total_revenue) || 0,
            orders_count: Number(item.orders_count) || 0,
            avg_price: Number(item.avg_price) || 0,
            min_price: Number(item.min_price) || 0,
            max_price: Number(item.max_price) || 0,
        }));
        const totalUnitsSold = items.reduce((sum, item) => sum + item.quantity, 0);
        const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);
        const share = (part: number, whole: number) => (whole > 0 ? parseFloat(((part / whole) * 100).toFixed(1)) : 0);
        const itemsWithPercentages = items.map((item) => ({
            ...item,
            percentage_of_units: share(item.quantity, totalUnitsSold),
            percentage_of_revenue: share(item.revenue, totalRevenue),
        }));

        const topProduct = itemsWithPercentages[0] ?? null;

        return NextResponse.json({
            success: true,
            timeframe,
            dateRange: {
                start: start.toISOString(),
                end: end.toISOString(),
                label,
            },
            summary: {
                totalUnitsSold,
                totalRevenue: parseFloat(totalRevenue.toFixed(2)),
                totalProducts: itemsWithPercentages.length,
                topProduct: topProduct
                    ? {
                          product_name: topProduct.product_name,
                          quantity: topProduct.quantity,
                          revenue: topProduct.revenue,
                      }
                    : null,
            },
            items: itemsWithPercentages,
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch items sold summary:");
    }
}
