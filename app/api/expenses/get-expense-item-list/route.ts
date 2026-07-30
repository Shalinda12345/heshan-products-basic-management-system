import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses_list } from "@/app/db/schema";


export const dynamic = "force-dynamic";

export async function GET(){
    try{
        const allExpenseItemsList = await db.select().from(expenses_list);
        return NextResponse.json(allExpenseItemsList);
    } catch (error) {
        console.error("Failed to fetch Expense Items: ", error);
        return NextResponse.json(
            {error: "Internal Server Error"},
            {status: 500}
        );
    }
}