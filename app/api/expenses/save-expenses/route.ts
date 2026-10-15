import { NextResponse } from "next/server";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { requestInfo } from "@/app/services/activity";
import { InsertExpenses, type ExpenseItemInput } from "@/app/services/insertExpenses";

// POST /api/expenses/save-expenses — { expense_name, employee_name?, quantity?, per_expense_amount, expense_date }
export async function POST(request: Request) {
    const auth = await authorize(request, "expenses.create");
    if (!auth.ok) return auth.response;
    try {
        const result = await InsertExpenses(await readJson<ExpenseItemInput>(request), actorOf(auth.user), requestInfo(request));
        return NextResponse.json({ success: true, message: "Expense saved successfully!", expense_item_id: result.expense_item_id }, { status: 201 });
    } catch (error) {
        return writeErrorJson(error, "Failed to save expenses:");
    }
}
