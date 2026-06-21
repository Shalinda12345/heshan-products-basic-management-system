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
    } catch (error: any){
        console.error("API Error saving sale:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal Server Error"},
            { status: 500 }
        )
    }
}

