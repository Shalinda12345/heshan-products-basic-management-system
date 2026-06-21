import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { customers } from "@/app/db/schema";


export async function GET() {
    try{
        const allCustomers = await db.select().from(customers);
        return NextResponse.json(allCustomers);
    } catch (error) {
        console.error("Failed to fetch customers", error);
        return NextResponse.json(
            {error: "Internal Server Error"},
            {status: 500}
        );
    }
}