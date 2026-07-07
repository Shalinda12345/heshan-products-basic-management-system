import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { employees } from "@/app/db/schema";


export async function GET() {
    try {
        const allEmployees = await db.select().from(employees);
        return NextResponse.json({ success: true, data: allEmployees });
    } catch (error) {
        console.error("Failed to fetch employees: ", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}