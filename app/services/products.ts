import { and, asc, eq, ne } from "drizzle-orm";
import { db, type DbExecutor } from "../db";
import { products } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { formatMoney, formatQty } from "../lib/format";
import { optionalAmount, optionalBoolean, optionalText, requiredText } from "../lib/validation";
import { changedFields, describeChanges, logActivity, type Actor, type RequestInfo } from "./activity";
import { applyStockMovement } from "./stockLedger";

export interface Product {
    product_id: number;
    product_name: string;
    description: string;
    unit_price: number | null;
    unit_cost: number | null;
    reorder_level: number | null;
    is_active: boolean;
}

const LABELS: Record<string, string> = {
    product_name: "name",
    description: "description",
    unit_price: "price",
    unit_cost: "unit cost",
    reorder_level: "reorder level",
};

function formatField(field: string, value: unknown): string | undefined {
    if (value === null) return undefined;
    if (field === "unit_price" || field === "unit_cost") return formatMoney(Number(value));
    if (field === "reorder_level") return formatQty(Number(value));
    return undefined;
}

function toProduct(row: typeof products.$inferSelect): Product {
    const num = (v: number | null) => (v === null || v === undefined ? null : Number(v));
    return {
        product_id: Number(row.product_id),
        product_name: row.product_name,
        description: row.description,
        unit_price: num(row.unit_price),
        unit_cost: num(row.unit_cost),
        reorder_level: num(row.reorder_level),
        is_active: row.is_active,
    };
}

export async function listProducts(options: { includeInactive?: boolean } = {}): Promise<Product[]> {
    const rows = await db
        .select()
        .from(products)
        .where(options.includeInactive ? undefined : eq(products.is_active, true))
        .orderBy(asc(products.product_id));
    return rows.map(toProduct);
}

export async function findProduct(executor: DbExecutor, id: number): Promise<Product | null> {
    const [row] = await executor.select().from(products).where(eq(products.product_id, id));
    return row ? toProduct(row) : null;
}

// Product names identify products on invoices, so two products can't share one (ignoring case)
async function assertNameFree(executor: DbExecutor, name: string, exceptId?: number) {
    const [clash] = await executor
        .select({ product_name: products.product_name })
        .from(products)
        .where(and(eq(products.product_name, name), exceptId ? ne(products.product_id, exceptId) : undefined));
    if (clash) throw new RequestError(`A product named "${clash.product_name}" already exists.`, 409);
}

export interface ProductInput {
    product_name?: unknown;
    description?: unknown;
    unit_price?: unknown;
    unit_cost?: unknown;
    reorder_level?: unknown;
    opening_stock?: unknown;
    is_active?: unknown;
}

export async function createProduct(actor: Actor, input: ProductInput, info: RequestInfo): Promise<Product> {
    const values = {
        product_name: requiredText(input.product_name, "Product name"),
        description: optionalText(input.description, "Description") ?? "",
        unit_price: optionalAmount(input.unit_price, "Selling price"),
        unit_cost: optionalAmount(input.unit_cost, "Unit cost"),
        reorder_level: optionalAmount(input.reorder_level, "Reorder level"),
    };
    const openingStock = optionalAmount(input.opening_stock, "Opening stock") ?? 0;

    return db.transaction(async (tx) => {
        await assertNameFree(tx, values.product_name);
        const [result] = await tx.insert(products).values(values);
        const productId = Number(result.insertId);

        if (openingStock > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            await applyStockMovement(tx, {
                productId,
                productName: values.product_name,
                movementType: "opening_balance",
                quantity: openingStock,
                movementDate: today,
                reference: "Opening stock",
                createdBy: actor.id,
            });
        }

        await logActivity(tx, actor, {
            action: "product.create",
            summary: `Added product "${values.product_name}"${values.unit_price !== null ? ` at ${formatMoney(values.unit_price)}` : ""}${openingStock > 0 ? ` with ${formatQty(openingStock)} in stock` : ""}`,
            entityType: "product",
            entityId: productId,
            details: { ...values, opening_stock: openingStock },
        }, info);

        return (await findProduct(tx, productId))!;
    });
}

export async function updateProduct(actor: Actor, id: number, input: ProductInput, info: RequestInfo): Promise<Product> {
    const next: Partial<Omit<Product, "product_id">> = {};
    if (input.product_name !== undefined) next.product_name = requiredText(input.product_name, "Product name");
    if (input.description !== undefined) next.description = optionalText(input.description, "Description") ?? "";
    if (input.unit_price !== undefined) next.unit_price = optionalAmount(input.unit_price, "Selling price");
    if (input.unit_cost !== undefined) next.unit_cost = optionalAmount(input.unit_cost, "Unit cost");
    if (input.reorder_level !== undefined) next.reorder_level = optionalAmount(input.reorder_level, "Reorder level");
    const active = optionalBoolean(input.is_active, "is_active");
    if (active !== undefined) next.is_active = active;

    return db.transaction(async (tx) => {
        const current = await findProduct(tx, id);
        if (!current) throw new RequestError("Product not found.", 404);
        if (next.product_name !== undefined && next.product_name !== current.product_name) {
            await assertNameFree(tx, next.product_name, id);
        }

        const changes = changedFields({ ...current }, next);
        if (Object.keys(changes).length === 0) return current;

        await tx.update(products).set(next).where(eq(products.product_id, id));
        await logActivity(tx, actor, {
            action: "product.update",
            summary: `Updated product "${current.product_name}": ${describeChanges(changes, LABELS, formatField)}`,
            entityType: "product",
            entityId: id,
            details: { changes },
        }, info);
        return (await findProduct(tx, id))!;
    });
}
