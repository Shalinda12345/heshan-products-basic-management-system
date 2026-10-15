import { NextResponse } from "next/server";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { requestInfo } from "@/app/services/activity";
import { InsertSales, type CreateSaleInput } from "@/app/services/insertSales";

// POST /api/sales/save-sales — { customer_id?, customer_name, sale_date, items: [{ product_id?, product_name, quantity, selling_price }] }
export async function POST(request: Request) {
    const auth = await authorize(request, "sales.create");
    if (!auth.ok) return auth.response;
    try {
        const result = await InsertSales(await readJson<CreateSaleInput>(request), actorOf(auth.user), requestInfo(request));
        return NextResponse.json({ success: true, message: "Invoice saved successfully!", sale_id: result.sale_id }, { status: 201 });
    } catch (error) {
        return writeErrorJson(error, "Failed to save sales:");
    }
}
