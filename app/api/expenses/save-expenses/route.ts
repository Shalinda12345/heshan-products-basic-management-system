import { NextResponse } from "next/server";
import { InsertExpenses } from "@/app/services/insertExpenses";
import { toErrorResponse } from "@/app/lib/api-error";

export async function POST(request:Request) {
    try{
        const body = await request.json();

        const result = await InsertExpenses(body);

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