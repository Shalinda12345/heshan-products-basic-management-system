import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { RequestError, readErrorJson } from "@/app/lib/api-error";
import { ACTIVITY_CATEGORIES, isActivityAction, type ActivityCategory } from "@/app/lib/activity";
import { dateRangeParams, pageParams, positiveId } from "@/app/lib/validation";
import { activityCsv, activityUsers, listActivity } from "@/app/services/activityLog";

export const dynamic = "force-dynamic";

const CSV_MAX_ROWS = 10_000;

// GET /api/activity — the activity log, newest first (owners and administrators)
//   ?from= &to=               inclusive dates (YYYY-MM-DD)
//   ?user_id=                 one user
//   ?category=                access | users | sales | returns | expenses | stock | master_data
//   ?action=                  one action, e.g. sale.void
//   ?entity_type= &entity_id= the history of one record, e.g. sale 12
//   ?attention=1              only entries worth a closer look (voids, corrections, failed sign-ins...)
//   ?q=                       words in the summary or username
//   ?page= &page_size=        1-based page, 1-200 rows (default 50)
//   ?format=csv               download every matching entry (up to 10,000) as CSV
//   ?include_users=1          also list everyone who appears in the log (for the "who" filter)
export async function GET(request: Request) {
    const auth = await authorize(request, "activity.view");
    if (!auth.ok) return auth.response;
    try {
        const params = new URL(request.url).searchParams;
        const category = params.get("category");
        if (category && !(category in ACTIVITY_CATEGORIES)) throw new RequestError("Invalid parameter: category");
        const action = params.get("action");
        if (action && !isActivityAction(action)) throw new RequestError("Invalid parameter: action");
        const userId = params.get("user_id");
        const csv = params.get("format") === "csv";

        const filters = {
            ...dateRangeParams(params),
            ...(csv ? { page: 1, pageSize: CSV_MAX_ROWS } : pageParams(params)),
            userId: userId ? positiveId(userId, "user_id") : null,
            category: (category as ActivityCategory | null) || null,
            action: action && isActivityAction(action) ? action : null,
            entityType: params.get("entity_type") || null,
            entityId: params.get("entity_id") || null,
            attentionOnly: params.get("attention") === "1",
            search: params.get("q"),
        };
        const result = await listActivity(filters);

        if (csv) {
            return new Response(activityCsv(result.rows), {
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="activity-log-${new Date().toISOString().slice(0, 10)}.csv"`,
                    "Cache-Control": "no-store",
                },
            });
        }
        const people = params.get("include_users") === "1" ? { users: await activityUsers() } : {};
        return NextResponse.json({ ...result, ...people }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to read the activity log:");
    }
}
