import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { RequestError, readErrorJson, readJson, writeErrorJson } from "@/app/lib/api-error";
import { hasPermission } from "@/app/lib/permissions";
import { FORBIDDEN_MESSAGE } from "@/app/lib/session";
import { requestInfo } from "@/app/services/activity";
import { createCustomer, listCustomers, listCustomersWithActivity } from "@/app/services/customers";

export const dynamic = "force-dynamic";

// GET /api/customers — active customers for the invoice picker.
//   ?include_inactive=1  all customers
//   ?with_activity=1     all customers with their invoice count, total sales and last purchase (managers)
export async function GET(request: Request) {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;
    try {
        const { searchParams } = new URL(request.url);
        if (searchParams.get("with_activity") === "1") {
            if (!hasPermission(auth.user.role, "masterdata.manage")) throw new RequestError(FORBIDDEN_MESSAGE, 403);
            return NextResponse.json(await listCustomersWithActivity(), { headers: { "Cache-Control": "no-store" } });
        }
        const rows = await listCustomers({ includeInactive: searchParams.get("include_inactive") === "1" });
        return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch customers");
    }
}

// POST /api/customers — { customer_name, phone?, address? }
export async function POST(request: Request) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const customer = await createCustomer(actorOf(auth.user), await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: customer }, { status: 201 });
    } catch (error) {
        return writeErrorJson(error, "Failed to create customer:");
    }
}
