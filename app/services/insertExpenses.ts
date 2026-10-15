import { db } from "../db";
import { expenses } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { EXPENSE_KINDS } from "../lib/expense-kinds";
import { formatMoney, formatQty } from "../lib/format";
import { roundMoney } from "../lib/money";
import { isIsoDate, parseLocalDate } from "../lib/dates";
import { AMOUNT_LIMIT } from "../lib/validation";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { findEmployeeByName, inactiveEmployeeMessage } from "./employees";
import { findExpenseCategoryByName } from "./expenseCategories";

export interface ExpenseItemInput {
    expense_name: string;
    employee_name?: string; // Employee paid, for salary-type expenses
    quantity: number;
    per_expense_amount: number;
    total?: number; // ignored: recomputed from quantity × per_expense_amount
    expense_date: string; // Received as "YYYY-MM-DD" string from client
}

export async function InsertExpenses(data: ExpenseItemInput, actor: Actor | null = null, info?: RequestInfo) {
    if (!data) {
        throw new RequestError("No expense data provided.");
    }
    if (typeof data.expense_name !== "string" || !data.expense_name.trim()) {
        throw new RequestError("Expense name is required.");
    }
    if (!data.expense_date) {
        throw new RequestError("Expense date is required.");
    }
    if (!isIsoDate(data.expense_date)) {
        throw new RequestError("Expense date must be a valid date (YYYY-MM-DD).");
    }
    const perAmount = Number(data.per_expense_amount);
    if (data.per_expense_amount === undefined || !Number.isFinite(perAmount) || perAmount < 0) {
        throw new RequestError("Per-expense amount cannot be negative.");
    }
    if (perAmount === 0) {
        throw new RequestError("Per-expense amount must be greater than 0.");
    }

    const qty = data.quantity ? Number(data.quantity) : 1;
    if (!Number.isFinite(qty) || qty <= 0) {
        throw new RequestError("Quantity must be greater than 0.");
    }
    const calculatedTotal = roundMoney(qty * perAmount);
    // The amount columns hold values below AMOUNT_LIMIT
    if (qty >= AMOUNT_LIMIT || perAmount >= AMOUNT_LIMIT || calculatedTotal >= AMOUNT_LIMIT) {
        throw new RequestError("The quantity or amount is too large.");
    }
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
            if (!employee.is_active) throw new RequestError(inactiveEmployeeMessage(employee.employee_name));
            employeeName = employee.employee_name;
        }

        const [result] = await tx.insert(expenses).values({
            expense_name: category.expense_name,
            employee_name: employeeName,
            quantity: qty,
            per_expense_amount: perAmount,
            total: calculatedTotal,
            expense_date: parsedDate,
            created_by: actor?.id ?? null,
        });

        const newExpenseId = result.insertId;

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
