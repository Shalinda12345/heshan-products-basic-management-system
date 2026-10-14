import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses_list } from "@/app/db/schema";
import { toReadErrorResponse } from "@/app/lib/api-error";


export const dynamic = "force-dynamic";

export async function GET(){
    try{
        const allExpenseItemsList = await db.select().from(expenses_list);
        return NextResponse.json(allExpenseItemsList);
    } catch (error) {
        console.error("Failed to fetch Expense Items: ", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}