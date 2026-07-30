import { NextResponse } from "next/server";
import { InsertSales } from "@/app/services/insertSales";

export async function POST(request: Request){
    try{
        const body = await request.json();

        const result = await InsertSales(body);

        return NextResponse.json({
            success: true,
            message: "Invoice saved successfully!",
            sale_id: result.sale_id
        }, { status: 201 });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to save sales: ", errorMessage);
        
        return NextResponse.json(
            { success: false, message: errorMessage, error: errorMessage },
            { status: 400 }
        );
    }
}


