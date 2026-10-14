import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, type DbExecutor } from "../db";
import { customers, sales } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { optionalBoolean, optionalText, requiredText } from "../lib/validation";
import { changedFields, describeChanges, logActivity, type Actor, type RequestInfo } from "./activity";

export interface Customer {
    customer_id: number;
    customer_name: string;
    phone: string | null;
    address: string | null;
    is_active: boolean;
}

export interface CustomerWithActivity extends Customer {
    invoices: number;
    total_sales: number;
    last_purchase: string | null;
}

const LABELS: Record<string, string> = { customer_name: "name", phone: "phone", address: "address" };

function toCustomer(row: typeof customers.$inferSelect): Customer {
    return {
        customer_id: Number(row.customer_id),
        customer_name: row.customer_name,
        phone: row.phone,
        address: row.address,
        is_active: row.is_active,
    };
}

export async function listCustomers(options: { includeInactive?: boolean } = {}): Promise<Customer[]> {
    const rows = await db
        .select()
        .from(customers)
        .where(options.includeInactive ? undefined : eq(customers.is_active, true))
        .orderBy(asc(customers.customer_id));
    return rows.map(toCustomer);
}

// Every customer with what they have bought (posted invoices only), for the management page
export async function listCustomersWithActivity(): Promise<CustomerWithActivity[]> {
    const [rows, totals] = await Promise.all([
        db.select().from(customers).orderBy(asc(customers.customer_name)),
        db.select({
            customer_id: sales.customer_id,
            invoices: sql<number>`COUNT(*)`,
            total_sales: sql<number>`COALESCE(SUM(${sales.grand_total}), 0)`,
            last_purchase: sql<string>`DATE_FORMAT(MAX(${sales.sale_date}), '%Y-%m-%d')`,
        })
            .from(sales)
            .where(and(eq(sales.status, "posted"), sql`${sales.customer_id} IS NOT NULL`))
            .groupBy(sales.customer_id),
    ]);
    const byId = new Map(totals.map((t) => [Number(t.customer_id), t]));
    return rows.map((row) => {
        const t = byId.get(Number(row.customer_id));
        return {
            ...toCustomer(row),
            invoices: Number(t?.invoices ?? 0),
            total_sales: Number(t?.total_sales ?? 0),
            last_purchase: t?.last_purchase ?? null,
        };
    });
}

export async function findCustomer(executor: DbExecutor, id: number): Promise<Customer | null> {
    const [row] = await executor.select().from(customers).where(eq(customers.customer_id, id));
    return row ? toCustomer(row) : null;
}

export async function findCustomerByName(executor: DbExecutor, name: string): Promise<Customer | null> {
    const [row] = await executor.select().from(customers).where(eq(customers.customer_name, name)).orderBy(asc(customers.customer_id)).limit(1);
    return row ? toCustomer(row) : null;
}

async function assertNameFree(executor: DbExecutor, name: string, exceptId?: number) {
    const [clash] = await executor
        .select({ customer_name: customers.customer_name })
        .from(customers)
        .where(and(eq(customers.customer_name, name), exceptId ? ne(customers.customer_id, exceptId) : undefined));
    if (clash) throw new RequestError(`A customer named "${clash.customer_name}" already exists.`, 409);
}

export interface CustomerInput {
    customer_name?: unknown;
    phone?: unknown;
    address?: unknown;
    is_active?: unknown;
}

export async function createCustomer(actor: Actor, input: CustomerInput, info: RequestInfo): Promise<Customer> {
    const values = {
        customer_name: requiredText(input.customer_name, "Customer name"),
        phone: optionalText(input.phone, "Phone", 50),
        address: optionalText(input.address, "Address"),
    };
    return db.transaction(async (tx) => {
        await assertNameFree(tx, values.customer_name);
        const [result] = await tx.insert(customers).values(values);
        const id = Number(result.insertId);
        await logActivity(tx, actor, {
            action: "customer.create",
            summary: `Added customer "${values.customer_name}"`,
            entityType: "customer",
            entityId: id,
            details: values,
        }, info);
        return (await findCustomer(tx, id))!;
    });
}

export async function updateCustomer(actor: Actor, id: number, input: CustomerInput, info: RequestInfo): Promise<Customer> {
    const next: Partial<Omit<Customer, "customer_id">> = {};
    if (input.customer_name !== undefined) next.customer_name = requiredText(input.customer_name, "Customer name");
    if (input.phone !== undefined) next.phone = optionalText(input.phone, "Phone", 50);
    if (input.address !== undefined) next.address = optionalText(input.address, "Address");
    const active = optionalBoolean(input.is_active, "is_active");
    if (active !== undefined) next.is_active = active;

    return db.transaction(async (tx) => {
        const current = await findCustomer(tx, id);
        if (!current) throw new RequestError("Customer not found.", 404);
        if (next.customer_name !== undefined && next.customer_name !== current.customer_name) {
            await assertNameFree(tx, next.customer_name, id);
        }
        const changes = changedFields({ ...current }, next);
        if (Object.keys(changes).length === 0) return current;

        await tx.update(customers).set(next).where(eq(customers.customer_id, id));
        await logActivity(tx, actor, {
            action: "customer.update",
            summary: `Updated customer "${current.customer_name}": ${describeChanges(changes, LABELS)}`,
            entityType: "customer",
            entityId: id,
            details: { changes },
        }, info);
        return (await findCustomer(tx, id))!;
    });
}
