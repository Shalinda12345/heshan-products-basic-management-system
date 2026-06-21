import { db } from "../db";
import { expenses } from "../db/schema";

interface ExpenseItemInput {
    expense_name: string;
    quantity: number;
    per_expense_amount: number;
    total: number;
    expense_date: string; // Received as "YYYY-MM-DD" string from client
}

export async function InsertExpenses(data: ExpenseItemInput) {
    if (!data) {
        throw new Error("No expense items found.");
    }

    // Convert the date string into a real JavaScript Date object for Drizzle
    const parsedDate = new Date(data.expense_date);

    return await db.transaction(async (tx) => {
        
        // 1. Insert into the main 'expenses' table
        const [Expense_result] = await tx.insert(expenses).values({
            expense_name: data.expense_name,
            quantity: data.quantity,
            per_expense_amount: data.per_expense_amount,
            total: data.total,
            expense_date: parsedDate, // Fixes missing property & type error
        });

        const newExpenseId = Expense_result.insertId;

        return { expense_item_id: newExpenseId };
    });
}