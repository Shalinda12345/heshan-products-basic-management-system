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
    } catch (error:any) {
        console.error("API Error saving expense:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal Server Error"},
            { status: 500 }
        )
    }
}