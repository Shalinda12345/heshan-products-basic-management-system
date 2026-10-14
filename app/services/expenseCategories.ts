import { and, asc, eq, ne } from "drizzle-orm";
import { db, type DbExecutor } from "../db";
import { expenses, expenses_list } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { EXPENSE_KINDS, isExpenseKind, type ExpenseKind } from "../lib/expense-kinds";
import { optionalBoolean, requiredText } from "../lib/validation";
import { changedFields, describeChanges, logActivity, type Actor, type RequestInfo } from "./activity";

export interface ExpenseCategory {
    expense_id: number;
    expense_name: string;
    kind: ExpenseKind;
    is_active: boolean;
}

function toCategory(row: typeof expenses_list.$inferSelect): ExpenseCategory {
    return {
        expense_id: Number(row.expense_id),
        expense_name: row.expense_name,
        kind: isExpenseKind(row.kind) ? row.kind : "standard",
        is_active: row.is_active,
    };
}

export async function listExpenseCategories(options: { includeInactive?: boolean } = {}): Promise<ExpenseCategory[]> {
    const rows = await db
        .select()
        .from(expenses_list)
        .where(options.includeInactive ? undefined : eq(expenses_list.is_active, true))
        .orderBy(asc(expenses_list.expense_id));
    return rows.map(toCategory);
}

export async function findExpenseCategory(executor: DbExecutor, id: number): Promise<ExpenseCategory | null> {
    const [row] = await executor.select().from(expenses_list).where(eq(expenses_list.expense_id, id));
    return row ? toCategory(row) : null;
}

export async function findExpenseCategoryByName(executor: DbExecutor, name: string): Promise<ExpenseCategory | null> {
    const [row] = await executor.select().from(expenses_list).where(eq(expenses_list.expense_name, name)).orderBy(asc(expenses_list.expense_id)).limit(1);
    return row ? toCategory(row) : null;
}

async function assertNameFree(executor: DbExecutor, name: string, exceptId?: number) {
    const [clash] = await executor
        .select({ expense_name: expenses_list.expense_name })
        .from(expenses_list)
        .where(and(eq(expenses_list.expense_name, name), exceptId ? ne(expenses_list.expense_id, exceptId) : undefined));
    if (clash) throw new RequestError(`An expense category named "${clash.expense_name}" already exists.`, 409);
}

function kindOf(value: unknown): ExpenseKind {
    if (!isExpenseKind(value)) {
        throw new RequestError(`Category type must be one of: ${Object.keys(EXPENSE_KINDS).join(", ")}.`);
    }
    return value;
}

export interface ExpenseCategoryInput {
    expense_name?: unknown;
    kind?: unknown;
    is_active?: unknown;
}

export async function createExpenseCategory(actor: Actor, input: ExpenseCategoryInput, info: RequestInfo): Promise<ExpenseCategory> {
    const values = {
        expense_name: requiredText(input.expense_name, "Category name"),
        kind: input.kind === undefined ? "standard" : kindOf(input.kind),
    };
    return db.transaction(async (tx) => {
        await assertNameFree(tx, values.expense_name);
        const [result] = await tx.insert(expenses_list).values(values);
        const id = Number(result.insertId);
        await logActivity(tx, actor, {
            action: "expense_category.create",
            summary: `Added expense category "${values.expense_name}" (${EXPENSE_KINDS[values.kind].label})`,
            entityType: "expense_category",
            entityId: id,
            details: values,
        }, info);
        return (await findExpenseCategory(tx, id))!;
    });
}

// Renaming a category relabels its past expenses too, so reports keep them under one name
export async function updateExpenseCategory(actor: Actor, id: number, input: ExpenseCategoryInput, info: RequestInfo): Promise<ExpenseCategory> {
    const next: Partial<Omit<ExpenseCategory, "expense_id">> = {};
    if (input.expense_name !== undefined) next.expense_name = requiredText(input.expense_name, "Category name");
    if (input.kind !== undefined) next.kind = kindOf(input.kind);
    const active = optionalBoolean(input.is_active, "is_active");
    if (active !== undefined) next.is_active = active;

    return db.transaction(async (tx) => {
        const current = await findExpenseCategory(tx, id);
        if (!current) throw new RequestError("Expense category not found.", 404);
        const renamed = next.expense_name !== undefined && next.expense_name !== current.expense_name;
        if (renamed) await assertNameFree(tx, next.expense_name!, id);

        const changes = changedFields({ ...current }, next);
        if (Object.keys(changes).length === 0) return current;

        await tx.update(expenses_list).set(next).where(eq(expenses_list.expense_id, id));
        let renamedEntries = 0;
        if (renamed) {
            const [result] = await tx.update(expenses)
                .set({ expense_name: next.expense_name! })
                .where(eq(expenses.expense_name, current.expense_name));
            renamedEntries = result.affectedRows;
        }
        await logActivity(tx, actor, {
            action: "expense_category.update",
            summary: `Updated expense category "${current.expense_name}": ${describeChanges(changes, { expense_name: "name", kind: "type" },
                (field, value) => (field === "kind" && isExpenseKind(value) ? EXPENSE_KINDS[value].label : undefined))}${renamedEntries ? ` (${renamedEntries} past entr${renamedEntries === 1 ? "y" : "ies"} relabelled)` : ""}`,
            entityType: "expense_category",
            entityId: id,
            details: { changes, renamed_expense_entries: renamedEntries },
        }, info);
        return (await findExpenseCategory(tx, id))!;
    });
}
