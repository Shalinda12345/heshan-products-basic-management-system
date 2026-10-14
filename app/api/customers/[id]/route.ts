import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { updateCustomer } from "@/app/services/customers";

// PATCH /api/customers/:id — any of { customer_name, phone, address, is_active }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "customer id");
        const customer = await updateCustomer(actorOf(auth.user), id, await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: customer });
    } catch (error) {
        return writeErrorJson(error, "Failed to update customer:");
    }
}
