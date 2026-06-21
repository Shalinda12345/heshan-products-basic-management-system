import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses_list } from "@/app/db/schema";


export async function GET(){
    try{
        const allExpneseItemsList = await db.select().from(expenses_list);
        return NextResponse.json(allExpneseItemsList);
    } catch (error) {
        console.error("Failed to fetch Expense Items: ", error);
        return NextResponse.json(
            {error: "Internal Server Error"},
            {status: 500}
        );
    }
}