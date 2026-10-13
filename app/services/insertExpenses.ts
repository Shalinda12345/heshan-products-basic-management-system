import { db } from "../db";
import { expenses } from "../db/schema";
import { roundMoney } from "../lib/money";

interface ExpenseItemInput {
    expense_name: string;
    employee_name?: string; // Employee paid, for salary-type expenses
    quantity: number;
    per_expense_amount: number;
    total?: number; // ignored: recomputed from quantity × per_expense_amount
    expense_date: string; // Received as "YYYY-MM-DD" string from client
}

function parseLocalDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
}

export async function InsertExpenses(data: ExpenseItemInput) {
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

    return await db.transaction(async (tx) => {
        // 1. Insert into the main 'expenses' table
        const [Expense_result] = await tx.insert(expenses).values({
            expense_name: data.expense_name.trim(),
            employee_name: String(data.employee_name ?? "").trim() || null,
            quantity: qty,
            per_expense_amount: perAmount,
            total: calculatedTotal,
            expense_date: parsedDate,
        });

        const newExpenseId = Expense_result.insertId;

        return { expense_item_id: newExpenseId };
    });
}
