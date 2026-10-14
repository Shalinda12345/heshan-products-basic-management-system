import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { updateEmployee } from "@/app/services/employees";

// PATCH /api/employees/:id — any of { employee_name, employee_address, employee_contact_no, maritial_status, is_active }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "employee id");
        const employee = await updateEmployee(actorOf(auth.user), id, await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: employee });
    } catch (error) {
        return writeErrorJson(error, "Failed to update employee:");
    }
}
