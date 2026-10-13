import { NextResponse } from "next/server";
import { InsertSales } from "@/app/services/insertSales";
import { toErrorResponse } from "@/app/lib/api-error";

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
        console.error("Failed to save sales: ", error);
        const { message, status } = toErrorResponse(error);

        return NextResponse.json(
            { success: false, message, error: message },
            { status }
        );
    }
}

