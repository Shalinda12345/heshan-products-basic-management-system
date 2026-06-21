import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { products } from "@/app/db/schema";


export async function GET(){
    try{
        const allProducts = await db.select().from(products);
        return NextResponse.json(allProducts);
    } catch (error) {
        console.error("Failed to fetch products: ", error);
        return NextResponse.json(
            {error: "Internal Server Error"},
            {status: 500}
        );
    }
}