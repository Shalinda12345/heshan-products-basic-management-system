import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { products, stocks } from "@/app/db/schema";
import { eq, sql } from "drizzle-orm";

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
        const { product_id, quantity } = body;

        if (!product_id || quantity === undefined || quantity <= 0) {
            return NextResponse.json(
                { error: "Product ID and a positive quantity are required." },
                { status: 400 }
            );
        }

        // Verify product exists in products table
        const [existingProduct] = await db.select()
            .from(products)
            .where(eq(products.product_id, Number(product_id)));

        if (!existingProduct) {
            return NextResponse.json(
                { error: `Product ID ${product_id} not found.` },
                { status: 404 }
            );
        }

        const result = await db.transaction(async (tx) => {
            // Check if stock record already exists for the product
            const [existingStock] = await tx.select()
                .from(stocks)
                .where(eq(stocks.product_id, Number(product_id)));

            if (existingStock) {
                // Atomically add quantity using SQL to prevent race conditions
                await tx.update(stocks)
                    .set({ quantity: sql`${stocks.quantity} + ${Number(quantity)}` })
                    .where(eq(stocks.product_id, Number(product_id)));
                return { product_id, quantity: Number(existingStock.quantity) + Number(quantity) };
            } else {
                // Insert a new stock record
                await tx.insert(stocks).values({
                    product_id: Number(product_id),
                    quantity: Number(quantity),
                });
                return { product_id, quantity: Number(quantity) };
            }
        });

        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to add stock: ", errorMessage);
        return NextResponse.json({ error: errorMessage || "Internal Server Error" }, { status: 500 });
    }
}

