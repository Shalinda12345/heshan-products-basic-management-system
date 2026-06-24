import { NextResponse } from "next/server";
import { InsertExpenses } from "@/app/services/insertExpenses";

export async function POST(request:Request) {
    try{
        const body = await request.json();

        const result = await InsertExpenses(body);

        return NextResponse.json({
            success: true,
            message: "Invoice saved successfully!",
            expense_item_id: result.expense_item_id
        }, { status: 201 });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to fetch monthly expenses: ", errorMessage);
        
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}