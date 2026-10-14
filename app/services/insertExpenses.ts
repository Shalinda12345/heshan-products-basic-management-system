import { db } from "../db";
import { expenses } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { EXPENSE_KINDS } from "../lib/expense-kinds";
import { formatMoney, formatQty } from "../lib/format";
import { roundMoney } from "../lib/money";
import { parseLocalDate } from "../lib/dates";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { findEmployeeByName } from "./employees";
import { findExpenseCategoryByName } from "./expenseCategories";

interface ExpenseItemInput {
    expense_name: string;
    employee_name?: string; // Employee paid, for salary-type expenses
    quantity: number;
    per_expense_amount: number;
    total?: number; // ignored: recomputed from quantity × per_expense_amount
    expense_date: string; // Received as "YYYY-MM-DD" string from client
}

export async function InsertExpenses(data: ExpenseItemInput, actor: Actor | null = null, info?: RequestInfo) {
    if (!data) {
        throw new Error("No expense data provided.");
    }
    if (!data.expense_name || !data.expense_name.trim()) {
        throw new Error("Expense name is required.");
    }
    if (!data.expense_date) {
        throw new Error("Expense date is required.");
    }
    if (data.per_expense_amount === undefined || !Number.isFinite(Number(data.per_expense_amount)) || Number(data.per_expense_amount) < 0) {
        throw new Error("Per-expense amount cannot be negative.");
    }

    const qty = data.quantity ? Number(data.quantity) : 1;
    if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Quantity must be greater than 0.");
    }
    const perAmount = Number(data.per_expense_amount);
    const calculatedTotal = roundMoney(qty * perAmount);
    const parsedDate = parseLocalDate(data.expense_date);
    const employeeInput = String(data.employee_name ?? "").trim();

    return await db.transaction(async (tx) => {
        // The category must be on the expense category list; returns go through their own form
        const category = await findExpenseCategoryByName(tx, data.expense_name.trim());
        if (!category) {
            throw new RequestError(`"${data.expense_name.trim()}" is not an expense category. Add it to the category list first.`);
        }
        if (!category.is_active) {
            throw new RequestError(`The expense category "${category.expense_name}" is no longer in use.`);
        }
        if (category.kind === "return") {
            throw new RequestError("Returns are recorded with the return form, not as a plain expense.");
        }

        // Salary payments name an employee from the employee list
        let employeeName: string | null = null;
        if (category.kind === "salary") {
            if (!employeeInput) throw new RequestError(`Choose the employee for this ${category.expense_name} entry.`);
            const employee = await findEmployeeByName(tx, employeeInput);
            if (!employee) throw new RequestError(`Employee "${employeeInput}" not found.`);
            employeeName = employee.employee_name;
        }

        // 1. Insert into the main 'expenses' table
        const [Expense_result] = await tx.insert(expenses).values({
            expense_name: category.expense_name,
            employee_name: employeeName,
            quantity: qty,
            per_expense_amount: perAmount,
            total: calculatedTotal,
            expense_date: parsedDate,
            created_by: actor?.id ?? null,
        });

        const newExpenseId = Expense_result.insertId;

        await logActivity(tx, actor, {
            action: "expense.create",
            summary: `Recorded expense #${newExpenseId}: ${category.expense_name}${employeeName ? ` for ${employeeName}` : ""} ${formatMoney(calculatedTotal)}`
                + (category.kind === "quantity" ? ` (${formatQty(qty)} × ${formatMoney(perAmount)})` : "")
                + ` on ${data.expense_date}`,
            entityType: "expense",
            entityId: newExpenseId,
            details: {
                category: category.expense_name,
                kind: EXPENSE_KINDS[category.kind].label,
                employee: employeeName,
                quantity: qty,
                per_expense_amount: perAmount,
                total: calculatedTotal,
                expense_date: data.expense_date,
            },
        }, info);

        return { expense_item_id: newExpenseId };
    });
}
