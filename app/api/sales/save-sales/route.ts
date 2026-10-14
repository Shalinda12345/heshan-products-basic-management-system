import { NextResponse } from "next/server";
import { InsertSales } from "@/app/services/insertSales";
import { toErrorResponse } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { requestInfo } from "@/app/services/activity";

export async function POST(request: Request){
    const auth = await authorize(request, "sales.create");
    if (!auth.ok) return auth.response;
    try{
        const body = await request.json();

        const result = await InsertSales(body, actorOf(auth.user), requestInfo(request));

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

