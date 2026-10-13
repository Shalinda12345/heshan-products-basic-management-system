import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { products, stocks } from "@/app/db/schema";
import { eq, sql } from "drizzle-orm";
import { toErrorResponse } from "@/app/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const results = await db.select({
            product_id: products.product_id,
            product_name: products.product_name,
            description: products.description,
            quantity: stocks.quantity,
        })
        .from(products)
        .leftJoin(stocks, eq(products.product_id, stocks.product_id));

        // Format to default quantity to 0 if null
        const formattedResults = results.map(row => ({
            product_id: row.product_id,
            product_name: row.product_name,
            description: row.description,
            quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : 0,
        }));

        return NextResponse.json(formattedResults);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to fetch stock status: ", errorMessage);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const productId = Number(body.product_id);
        const quantity = Number(body.quantity);

        if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
            return NextResponse.json(
                { error: "Product ID and a positive quantity are required." },
                { status: 400 }
            );
        }

        // Verify product exists in products table
        const [existingProduct] = await db.select()
            .from(products)
            .where(eq(products.product_id, productId));

        if (!existingProduct) {
            return NextResponse.json(
                { error: `Product ID ${productId} not found.` },
                { status: 404 }
            );
        }

        const result = await db.transaction(async (tx) => {
            // Insert the first stock record or atomically add to the existing one (product_id is unique)
            await tx.insert(stocks)
                .values({ product_id: productId, quantity })
                .onDuplicateKeyUpdate({ set: { quantity: sql`${stocks.quantity} + ${quantity}` } });

            const [updated] = await tx.select({ quantity: stocks.quantity })
                .from(stocks)
                .where(eq(stocks.product_id, productId));

            return { product_id: productId, quantity: Number(updated.quantity) };
        });

        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (error: unknown) {
        console.error("Failed to add stock: ", error);
        const { message, status } = toErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}

