import { NextResponse } from "next/server";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { requestInfo } from "@/app/services/activity";
import { createReturn } from "@/app/services/returns";

export const dynamic = "force-dynamic";

// POST /api/expenses/save-return-expenses — one of three return types (see app/lib/returns.ts):
//   stock_expense_return:          { product_id, product_name, quantity, per_unit_amount, expense_date }
//   sale_reduction_return:         { sale_id, sale_product_name, sale_quantity, sale_per_unit_amount, product_id, expense_date }
//   sale_reduction_expense_return: { sale_id, sale_product_name, sale_quantity, sale_per_unit_amount, expense_per_unit_amount, expense_date }
export async function POST(request: Request) {
    const auth = await authorize(request, "returns.manage");
    if (!auth.ok) return auth.response;
    try {
        const { message, ...result } = await createReturn(await readJson(request), actorOf(auth.user), requestInfo(request));
        return NextResponse.json({ success: true, message, ...result }, { status: 201 });
    } catch (error) {
        return writeErrorJson(error, "Failed to process return:");
    }
}
