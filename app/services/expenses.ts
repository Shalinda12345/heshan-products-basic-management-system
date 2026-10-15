import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, type DbExecutor } from "../db";
import { expenses, returns } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { isoDateFromDb, parseLocalDate } from "../lib/dates";
import { formatMoney } from "../lib/format";
import { roundMoney } from "../lib/money";
import { AMOUNT_LIMIT, isoDate, likeContains, positiveNumber, requiredText } from "../lib/validation";
import { changedFields, describeChanges, logActivity, type Actor, type RequestInfo } from "./activity";
import { createdByUser, postedTotals, voidedByUser, voidedColumns, voidReason } from "./documents";
import { findEmployeeByName, inactiveEmployeeMessage } from "./employees";
import { findExpenseCategoryByName } from "./expenseCategories";

// Only posted expenses count in totals and reports; voided ones are kept for the record
export const postedExpense = eq(expenses.status, "posted");

// The posted expenses dated from `start` to `end`, newest first (the weekly and monthly expense pages)
export function postedExpensesBetween(start: Date, end: Date) {
    return db
        .select()
        .from(expenses)
        .where(and(gte(expenses.expense_date, start), lte(expenses.expense_date, end), postedExpense))
        .orderBy(desc(expenses.expense_date));
}

// The return that created an expense, if any: such expenses are corrected by voiding the return
async function returnOfExpense(executor: DbExecutor, expenseId: number) {
    const [row] = await executor
        .select({ return_id: returns.return_id, status: returns.status })
        .from(returns)
        .where(eq(returns.expense_item_id, expenseId))
        .limit(1);
    return row ?? null;
}

async function lockExpense(executor: DbExecutor, id: number) {
    const [row] = await executor.select().from(expenses).where(eq(expenses.expense_item_id, id)).for("update");
    if (!row) throw new RequestError(`Expense #${id} not found.`, 404);
    if (row.status === "void") throw new RequestError(`Expense #${id} has been voided and can no longer be changed.`, 409);
    const fromReturn = await returnOfExpense(executor, id);
    if (fromReturn) {
        throw new RequestError(`Expense #${id} was created by return #${fromReturn.return_id}. Void the return instead.`, 409);
    }
    return row;
}

export interface ExpenseUpdateInput {
    expense_name?: unknown;
    employee_name?: unknown;
    quantity?: unknown;
    per_expense_amount?: unknown;
    expense_date?: unknown;
}

const LABELS: Record<string, string> = {
    expense_name: "category",
    employee_name: "employee",
    quantity: "quantity",
    per_expense_amount: "rate",
    total: "total",
    expense_date: "date",
};

// Corrects a recorded expense (amount, quantity, date, category or employee); the total is recomputed
export async function updateExpense(actor: Actor, id: number, input: ExpenseUpdateInput, info: RequestInfo) {
    return db.transaction(async (tx) => {
        const row = await lockExpense(tx, id);
        const before = {
            expense_name: row.expense_name,
            employee_name: row.employee_name,
            quantity: row.quantity === null ? 1 : Number(row.quantity),
            per_expense_amount: Number(row.per_expense_amount),
            total: Number(row.total),
            expense_date: isoDateFromDb(row.expense_date),
        };

        const name = input.expense_name !== undefined ? requiredText(input.expense_name, "Category") : before.expense_name;
        const sameCategory = name === before.expense_name;
        const category = await findExpenseCategoryByName(tx, name);
        // An entry whose category is no longer on the list can still be corrected, as long as it keeps that category
        if (!category && !sameCategory) throw new RequestError(`"${name}" is not an expense category.`);
        if (category && category.kind === "return" && !sameCategory) throw new RequestError("An expense can't be turned into a return.");
        if (category && !category.is_active && !sameCategory) {
            throw new RequestError(`The expense category "${category.expense_name}" is no longer in use.`);
        }

        const quantity = input.quantity !== undefined ? positiveNumber(input.quantity, "Quantity") : before.quantity;
        const rate = input.per_expense_amount !== undefined ? positiveNumber(input.per_expense_amount, "Amount") : before.per_expense_amount;
        const date = input.expense_date !== undefined ? isoDate(input.expense_date, "Date") : before.expense_date;

        // Salary entries name an employee; an entry that keeps its category keeps its employee otherwise
        let employee: string | null = sameCategory ? before.employee_name : null;
        if (category?.kind === "salary") {
            const wanted = input.employee_name !== undefined ? String(input.employee_name ?? "").trim() : before.employee_name ?? "";
            if (!wanted) throw new RequestError(`Choose the employee for this ${category.expense_name} entry.`);
            const found = await findEmployeeByName(tx, wanted);
            if (!found) throw new RequestError(`Employee "${wanted}" not found.`);
            if (!found.is_active && found.employee_name !== before.employee_name) {
                throw new RequestError(inactiveEmployeeMessage(found.employee_name));
            }
            employee = found.employee_name;
        }

        const after = {
            expense_name: category?.expense_name ?? before.expense_name,
            employee_name: employee,
            quantity,
            per_expense_amount: rate,
            total: roundMoney(quantity * rate),
            expense_date: date,
        };
        if (after.total >= AMOUNT_LIMIT) throw new RequestError("The total is too large.");
        const changes = changedFields(before, after);
        if (Object.keys(changes).length === 0) return { expense_item_id: id, changed: false };

        await tx.update(expenses)
            .set({ ...after, expense_date: parseLocalDate(date) })
            .where(eq(expenses.expense_item_id, id));
        await logActivity(tx, actor, {
            action: "expense.update",
            summary: `Corrected expense #${id} (${before.expense_name}): ${describeChanges(changes, LABELS,
                (field, value) => (field === "total" || field === "per_expense_amount") && value !== null ? formatMoney(Number(value)) : undefined)}`,
            entityType: "expense",
            entityId: id,
            details: { changes },
        }, info);
        return { expense_item_id: id, changed: true };
    });
}

export async function voidExpense(actor: Actor, id: number, reasonInput: unknown, info: RequestInfo) {
    const reason = voidReason(reasonInput, "expense");

    return db.transaction(async (tx) => {
        const row = await lockExpense(tx, id);
        await tx.update(expenses).set(voidedColumns(actor, reason)).where(eq(expenses.expense_item_id, id));
        await logActivity(tx, actor, {
            action: "expense.void",
            summary: `Voided expense #${id} (${row.expense_name}${row.employee_name ? ` for ${row.employee_name}` : ""}, ${formatMoney(Number(row.total))} on ${isoDateFromDb(row.expense_date)}): ${reason}`,
            entityType: "expense",
            entityId: id,
            details: {
                reason,
                expense_name: row.expense_name,
                employee_name: row.employee_name,
                total: Number(row.total),
                expense_date: isoDateFromDb(row.expense_date),
            },
        }, info);
        return { expense_item_id: id };
    });
}

export interface ExpenseFilters {
    from?: string | null;
    to?: string | null;
    category?: string | null;
    status?: "posted" | "void" | null;
    search?: string | null;
    // Only entries this user recorded (for users who may record but not see all expenses)
    createdBy?: number | null;
    page: number;
    pageSize: number;
}

export async function listExpenses(filters: ExpenseFilters) {
    const where: SQL[] = [];
    if (filters.from) where.push(gte(expenses.expense_date, parseLocalDate(filters.from)));
    if (filters.to) where.push(lte(expenses.expense_date, parseLocalDate(filters.to)));
    if (filters.category) where.push(eq(expenses.expense_name, filters.category));
    if (filters.status) where.push(eq(expenses.status, filters.status));
    if (filters.createdBy) where.push(eq(expenses.created_by, filters.createdBy));
    const search = filters.search?.trim().replace(/^#/, "");
    if (search) {
        const asId = Number(search);
        const like = likeContains(search);
        where.push(Number.isInteger(asId) && asId > 0
            ? eq(expenses.expense_item_id, asId)
            : sql`(${expenses.expense_name} LIKE ${like} OR ${expenses.employee_name} LIKE ${like})`);
    }
    const condition = where.length ? and(...where) : undefined;

    const [rows, [summary]] = await Promise.all([
        db.select({
            expense_item_id: expenses.expense_item_id,
            expense_name: expenses.expense_name,
            employee_name: expenses.employee_name,
            quantity: expenses.quantity,
            per_expense_amount: expenses.per_expense_amount,
            total: expenses.total,
            expense_date: sql<string>`DATE_FORMAT(${expenses.expense_date}, '%Y-%m-%d')`,
            status: expenses.status,
            void_reason: expenses.void_reason,
            voided_at: expenses.voided_at,
            voided_by: voidedByUser.name,
            created_by: createdByUser.name,
            created_at: expenses.created_at,
            return_id: sql<number | null>`(SELECT MIN(${returns.return_id}) FROM ${returns} WHERE ${returns.expense_item_id} = ${expenses.expense_item_id})`,
        })
            .from(expenses)
            .leftJoin(createdByUser, eq(createdByUser.id, expenses.created_by))
            .leftJoin(voidedByUser, eq(voidedByUser.id, expenses.voided_by))
            .where(condition)
            .orderBy(desc(expenses.expense_date), desc(expenses.expense_item_id))
            .limit(filters.pageSize)
            .offset((filters.page - 1) * filters.pageSize),
        db.select(postedTotals(postedExpense, expenses.total)).from(expenses).where(condition),
    ]);

    return {
        rows: rows.map((row) => ({
            ...row,
            expense_item_id: Number(row.expense_item_id),
            quantity: row.quantity === null ? null : Number(row.quantity),
            per_expense_amount: Number(row.per_expense_amount),
            total: Number(row.total),
            return_id: row.return_id === null ? null : Number(row.return_id),
        })),
        total: Number(summary.count),
        page: filters.page,
        page_size: filters.pageSize,
        totals: { posted_count: Number(summary.posted_count), posted_amount: roundMoney(Number(summary.posted_total)) },
    };
}
