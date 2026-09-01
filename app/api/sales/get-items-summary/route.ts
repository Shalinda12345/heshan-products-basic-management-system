import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sales, sale_items } from "@/app/db/schema";
import { and, gte, lte, eq, sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function parseLocalDate(dateStr: string): Date {
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
}

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

    if (timeframe === "daily" || timeframe === "day") {
        let baseDate: Date;
        if (params.date) {
            baseDate = parseLocalDate(params.date);
        } else if (params.year && params.month) {
            baseDate = new Date(params.year, params.month - 1, 1);
        } else {
            baseDate = new Date(now);
        }

        const start = new Date(baseDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(baseDate);
        end.setHours(23, 59, 59, 999);

        return {
            start,
            end,
            label: start.toLocaleDateString(undefined, { dateStyle: "long" }),
        };
    }

    if (timeframe === "weekly" || timeframe === "week") {
        let baseDate = new Date(now);
        if (params.date) {
            baseDate = parseLocalDate(params.date);
        } else if (params.year && params.month) {
            baseDate = new Date(params.year, params.month - 1, 1);
        }

        const dayOfWeek = baseDate.getDay();
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

        const start = new Date(baseDate);
        start.setDate(baseDate.getDate() - daysToSubtract);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return {
            start,
            end,
            label: `${start.toLocaleDateString(undefined, { dateStyle: "medium" })} – ${end.toLocaleDateString(undefined, { dateStyle: "medium" })}`,
        };
    }

    if (timeframe === "monthly" || timeframe === "month") {
        const year = params.year ?? now.getFullYear();
        const month = params.month ? params.month - 1 : now.getMonth();

        const start = new Date(year, month, 1, 0, 0, 0, 0);
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

        const monthName = start.toLocaleString("default", { month: "long" });
        return {
            start,
            end,
            label: `${monthName} ${year}`,
        };
    }

    // Custom
    if (params.startDate && params.endDate) {
        const start = parseLocalDate(params.startDate);
        start.setHours(0, 0, 0, 0);

        const end = parseLocalDate(params.endDate);
        end.setHours(23, 59, 59, 999);

        return {
            start,
            end,
            label: `${start.toLocaleDateString(undefined, { dateStyle: "medium" })} – ${end.toLocaleDateString(undefined, { dateStyle: "medium" })}`,
        };
    }

    if (params.year && params.month) {
        const start = new Date(params.year, params.month - 1, 1, 0, 0, 0, 0);
        const end = new Date(params.year, params.month, 0, 23, 59, 59, 999);
        const monthName = start.toLocaleString("default", { month: "long" });
        return {
            start,
            end,
            label: `${monthName} ${params.year}`,
        };
    }

    // Fallback: current month
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
        start,
        end,
        label: `${start.toLocaleString("default", { month: "long" })} ${now.getFullYear()}`,
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const timeframe = (searchParams.get("timeframe") || searchParams.get("period") || "daily").toLowerCase();
        const year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : null;
        const month = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) : null;
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const date = searchParams.get("date");

        const { start, end, label } = getDateRange(timeframe, {
            year,
            month,
            startDate,
            endDate,
            date,
        });

        // Query aggregated items sold within date range
        const rawItems = await db
            .select({
                product_name: sale_items.product_name,
                total_quantity: sql<number>`COALESCE(SUM(${sale_items.quantity}), 0)`,
                total_revenue: sql<number>`COALESCE(SUM(${sale_items.total}), 0)`,
                orders_count: sql<number>`COUNT(DISTINCT ${sale_items.sale_id})`,
                avg_price: sql<number>`COALESCE(AVG(${sale_items.selling_price}), 0)`,
                min_price: sql<number>`COALESCE(MIN(${sale_items.selling_price}), 0)`,
                max_price: sql<number>`COALESCE(MAX(${sale_items.selling_price}), 0)`,
            })
            .from(sale_items)
            .innerJoin(sales, eq(sale_items.sale_id, sales.sale_id))
            .where(
                and(
                    gte(sales.sale_date, start),
                    lte(sales.sale_date, end)
                )
            )
            .groupBy(sale_items.product_name)
            .orderBy(desc(sql`SUM(${sale_items.quantity})`));

        // Format numbers cleanly
        let totalUnitsSold = 0;
        let totalRevenue = 0;
        let totalOrdersSet = new Set<number>();

        const formattedItems = rawItems.map((item) => {
            const quantity = Number(item.total_quantity) || 0;
            const revenue = Number(item.total_revenue) || 0;
            const orders = Number(item.orders_count) || 0;
            const avgPrice = Number(item.avg_price) || 0;
            const minPrice = Number(item.min_price) || 0;
            const maxPrice = Number(item.max_price) || 0;

            totalUnitsSold += quantity;
            totalRevenue += revenue;

            return {
                product_name: item.product_name,
                quantity,
                revenue,
                orders_count: orders,
                avg_price: avgPrice,
                min_price: minPrice,
                max_price: maxPrice,
                percentage_of_units: 0,
                percentage_of_revenue: 0,
            };
        });

        // Compute percentages
        const itemsWithPercentages = formattedItems.map((item) => ({
            ...item,
            percentage_of_units: totalUnitsSold > 0 ? parseFloat(((item.quantity / totalUnitsSold) * 100).toFixed(1)) : 0,
            percentage_of_revenue: totalRevenue > 0 ? parseFloat(((item.revenue / totalRevenue) * 100).toFixed(1)) : 0,
        }));

        const topProduct = itemsWithPercentages.length > 0 ? itemsWithPercentages[0] : null;

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
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                Pragma: "no-cache",
            },
        });
    } catch (error) {
        console.error("Failed to fetch items sold summary:", error);
        return NextResponse.json(
            { error: "Internal Server Error", message: (error as Error).message },
            { status: 500 }
        );
    }
}
