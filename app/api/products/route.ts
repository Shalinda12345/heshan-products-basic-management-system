import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readErrorJson, readJson, writeErrorJson } from "@/app/lib/api-error";
import { hasPermission } from "@/app/lib/permissions";
import { requestInfo } from "@/app/services/activity";
import { createProduct, listProducts } from "@/app/services/products";

export const dynamic = "force-dynamic";

// GET /api/products — active products (?include_inactive=1 for all). Unit costs only for those who see margins.
export async function GET(request: Request) {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;
    try {
        const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";
        const showCost = hasPermission(auth.user.role, "reports.view") || hasPermission(auth.user.role, "masterdata.manage");
        const rows = await listProducts({ includeInactive });
        return NextResponse.json(showCost ? rows : rows.map((row) => ({ ...row, unit_cost: null })), {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch products:");
    }
}

// POST /api/products — { product_name, description?, unit_price?, unit_cost?, reorder_level?, opening_stock? }
export async function POST(request: Request) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const product = await createProduct(actorOf(auth.user), await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: product }, { status: 201 });
    } catch (error) {
        return writeErrorJson(error, "Failed to create product:");
    }
}
