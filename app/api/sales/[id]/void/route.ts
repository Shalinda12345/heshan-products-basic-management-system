import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { voidSale } from "@/app/services/sales";

// POST /api/sales/:id/void — { reason }. Puts the invoice's remaining items back into stock and
// takes it out of every total; the invoice stays on file, marked void.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "sales.void");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "invoice number");
        const body = await readJson(request);
        const result = await voidSale(actorOf(auth.user), id, body.reason, requestInfo(request));
        return NextResponse.json({ success: true, message: `Invoice #${id} has been voided.`, data: result });
    } catch (error) {
        return writeErrorJson(error, "Failed to void invoice:");
    }
}
