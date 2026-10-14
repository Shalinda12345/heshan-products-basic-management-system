import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { updateProduct } from "@/app/services/products";

// PATCH /api/products/:id — any of { product_name, description, unit_price, unit_cost, reorder_level, is_active }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "product id");
        const product = await updateProduct(actorOf(auth.user), id, await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: product });
    } catch (error) {
        return writeErrorJson(error, "Failed to update product:");
    }
}
