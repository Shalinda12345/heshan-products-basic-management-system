import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { employees } from "@/app/db/schema";
import { toReadErrorResponse } from "@/app/lib/api-error";


export async function GET() {
    try {
        const allEmployees = await db.select().from(employees);
        return NextResponse.json({ success: true, data: allEmployees });
    } catch (error) {
        console.error("Failed to fetch employees: ", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}