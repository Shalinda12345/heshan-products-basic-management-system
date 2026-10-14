import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readErrorJson, readJson, writeErrorJson } from "@/app/lib/api-error";
import { hasPermission } from "@/app/lib/permissions";
import { requestInfo } from "@/app/services/activity";
import { createEmployee, listEmployees } from "@/app/services/employees";

export const dynamic = "force-dynamic";

// GET /api/employees — active employees for the salary picker, wrapped in { success, data } (?include_inactive=1 for all).
// Addresses and phone numbers only go to those who manage employee records.
export async function GET(request: Request) {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;
    try {
        const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";
        const rows = await listEmployees({ includeInactive });
        const data = hasPermission(auth.user.role, "masterdata.manage")
            ? rows
            : rows.map(({ employee_id, employee_name, is_active }) => ({ employee_id, employee_name, is_active }));
        return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch employees: ");
    }
}

// POST /api/employees — { employee_name, employee_address?, employee_contact_no?, maritial_status? }
export async function POST(request: Request) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const employee = await createEmployee(actorOf(auth.user), await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: employee }, { status: 201 });
    } catch (error) {
        return writeErrorJson(error, "Failed to create employee:");
    }
}
