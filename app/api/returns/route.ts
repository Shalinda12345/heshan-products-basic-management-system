import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { RequestError, readErrorJson } from "@/app/lib/api-error";
import { isReturnType } from "@/app/lib/returns";
import { dateRangeParams, pageParams, statusParam } from "@/app/lib/validation";
import { listReturns } from "@/app/services/returns";

export const dynamic = "force-dynamic";

// GET /api/returns — the returns register, newest first
//   ?from= &to=        inclusive dates (YYYY-MM-DD)
//   ?type=             one return type
//   ?status=           posted | void | all (default all)
//   ?page= &page_size= 1-based page, 1-200 rows (default 50)
export async function GET(request: Request) {
    const auth = await authorize(request, "returns.manage");
    if (!auth.ok) return auth.response;
    try {
        const params = new URL(request.url).searchParams;
        const type = params.get("type");
        if (type && !isReturnType(type)) throw new RequestError("Invalid parameter: type");
        const result = await listReturns({
            ...dateRangeParams(params),
            ...pageParams(params),
            type: type && isReturnType(type) ? type : null,
            status: statusParam(params),
        });
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to list returns:");
    }
}
