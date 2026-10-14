import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { customers } from "@/app/db/schema";
import { toReadErrorResponse } from "@/app/lib/api-error";


export async function GET() {
    try{
        const allCustomers = await db.select().from(customers);
        return NextResponse.json(allCustomers);
    } catch (error) {
        console.error("Failed to fetch customers", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}