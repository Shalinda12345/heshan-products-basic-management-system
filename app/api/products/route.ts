import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { products } from "@/app/db/schema";
import { toReadErrorResponse } from "@/app/lib/api-error";


export async function GET(){
    try{
        const allProducts = await db.select().from(products);
        return NextResponse.json(allProducts);
    } catch (error) {
        console.error("Failed to fetch products: ", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}