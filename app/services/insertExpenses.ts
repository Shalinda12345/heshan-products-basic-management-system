import { db } from "../db";
import { expenses } from "../db/schema";

interface ExpenseItemInput {
    expense_name: string;
    quantity: number;
    per_expense_amount: number;
    total: number;
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
    if (data.per_expense_amount === undefined || Number(data.per_expense_amount) < 0) {
        throw new Error("Per-expense amount cannot be negative.");
    }

    const qty = data.quantity ? Number(data.quantity) : 1;
    const perAmount = Number(data.per_expense_amount);
    const calculatedTotal = data.total !== undefined ? Number(data.total) : qty * perAmount;
    const parsedDate = parseLocalDate(data.expense_date);

    return await db.transaction(async (tx) => {
        // 1. Insert into the main 'expenses' table
        const [Expense_result] = await tx.insert(expenses).values({
            expense_name: data.expense_name.trim(),
            quantity: qty,
            per_expense_amount: perAmount,
            total: calculatedTotal,
            expense_date: parsedDate,
        });

        const newExpenseId = Expense_result.insertId;

        return { expense_item_id: newExpenseId };
    });
}