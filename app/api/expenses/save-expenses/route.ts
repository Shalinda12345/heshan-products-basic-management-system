import { NextResponse } from "next/server";
import { InsertExpenses } from "@/app/services/insertExpenses";
import { toErrorResponse } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { requestInfo } from "@/app/services/activity";

export async function POST(request:Request) {
    const auth = await authorize(request, "expenses.create");
    if (!auth.ok) return auth.response;
    try{
        const body = await request.json();

        const result = await InsertExpenses(body, actorOf(auth.user), requestInfo(request));

        return NextResponse.json({
            success: true,
            message: "Expense saved successfully!",
            expense_item_id: result.expense_item_id
        }, { status: 201 });
    } catch (error: unknown) {
        console.error("Failed to save expenses: ", error);
        const { message, status } = toErrorResponse(error);

        return NextResponse.json(
            { success: false, message, error: message },
            { status }
        );
    }
}