import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { readErrorJson } from "@/app/lib/api-error";
import { dateRangeParams, pageParams, positiveId, statusParam } from "@/app/lib/validation";
import { listInvoices } from "@/app/services/sales";

export const dynamic = "force-dynamic";

// GET /api/sales/invoices — the invoice register, newest first
//   ?from= &to=        inclusive dates (YYYY-MM-DD)
//   ?customer_id=      one customer
//   ?status=           posted | void | all (default all)
//   ?q=                invoice number or part of the customer name
//   ?page= &page_size= 1-based page, 1-200 rows (default 50)
export async function GET(request: Request) {
    const auth = await authorize(request, "sales.view");
    if (!auth.ok) return auth.response;
    try {
        const params = new URL(request.url).searchParams;
        const customer = params.get("customer_id");
        const result = await listInvoices({
            ...dateRangeParams(params),
            ...pageParams(params),
            customerId: customer ? positiveId(customer, "customer_id") : null,
            status: statusParam(params),
            search: params.get("q"),
        });
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to list invoices:");
    }
}
