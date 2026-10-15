import { and, asc, eq, ne } from "drizzle-orm";
import { db, type DbExecutor } from "../db";
import { employees, expenses } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { optionalBoolean, optionalText, requiredText } from "../lib/validation";
import { changedFields, describeChanges, logActivity, type Actor, type RequestInfo } from "./activity";

export interface Employee {
    employee_id: number;
    employee_name: string;
    employee_address: string;
    employee_contact_no: string;
    maritial_status: string;
    is_active: boolean;
}

const LABELS: Record<string, string> = {
    employee_name: "name",
    employee_address: "address",
    employee_contact_no: "contact number",
    maritial_status: "marital status",
};

function toEmployee(row: typeof employees.$inferSelect): Employee {
    return {
        employee_id: Number(row.employee_id),
        employee_name: row.employee_name,
        employee_address: row.employee_address,
        employee_contact_no: row.employee_contact_no,
        maritial_status: row.maritial_status,
        is_active: row.is_active,
    };
}

export async function listEmployees(options: { includeInactive?: boolean } = {}): Promise<Employee[]> {
    const rows = await db
        .select()
        .from(employees)
        .where(options.includeInactive ? undefined : eq(employees.is_active, true))
        .orderBy(asc(employees.employee_id));
    return rows.map(toEmployee);
}

export async function findEmployee(executor: DbExecutor, id: number): Promise<Employee | null> {
    const [row] = await executor.select().from(employees).where(eq(employees.employee_id, id));
    return row ? toEmployee(row) : null;
}

// Inactive employees keep their past salary entries but can't be paid again until they are reactivated
export function inactiveEmployeeMessage(name: string): string {
    return `${name} is inactive. Reactivate them on the Employees page before recording a payment.`;
}

export async function findEmployeeByName(executor: DbExecutor, name: string): Promise<Employee | null> {
    const [row] = await executor.select().from(employees).where(eq(employees.employee_name, name)).limit(1);
    return row ? toEmployee(row) : null;
}

// Salary expenses record the employee by name, so names must be unique
async function assertNameFree(executor: DbExecutor, name: string, exceptId?: number) {
    const [clash] = await executor
        .select({ employee_name: employees.employee_name })
        .from(employees)
        .where(and(eq(employees.employee_name, name), exceptId ? ne(employees.employee_id, exceptId) : undefined));
    if (clash) throw new RequestError(`An employee named "${clash.employee_name}" already exists.`, 409);
}

export interface EmployeeInput {
    employee_name?: unknown;
    employee_address?: unknown;
    employee_contact_no?: unknown;
    maritial_status?: unknown;
    is_active?: unknown;
}

export async function createEmployee(actor: Actor, input: EmployeeInput, info: RequestInfo): Promise<Employee> {
    const values = {
        employee_name: requiredText(input.employee_name, "Employee name"),
        employee_address: optionalText(input.employee_address, "Address") ?? "",
        employee_contact_no: optionalText(input.employee_contact_no, "Contact number") ?? "",
        maritial_status: optionalText(input.maritial_status, "Marital status") ?? "",
    };
    return db.transaction(async (tx) => {
        await assertNameFree(tx, values.employee_name);
        const [result] = await tx.insert(employees).values(values);
        const id = Number(result.insertId);
        await logActivity(tx, actor, {
            action: "employee.create",
            summary: `Added employee "${values.employee_name}"`,
            entityType: "employee",
            entityId: id,
            details: values,
        }, info);
        return (await findEmployee(tx, id))!;
    });
}

// Renaming an employee also renames them on their past salary entries, so their history stays together
export async function updateEmployee(actor: Actor, id: number, input: EmployeeInput, info: RequestInfo): Promise<Employee> {
    const next: Partial<Omit<Employee, "employee_id">> = {};
    if (input.employee_name !== undefined) next.employee_name = requiredText(input.employee_name, "Employee name");
    if (input.employee_address !== undefined) next.employee_address = optionalText(input.employee_address, "Address") ?? "";
    if (input.employee_contact_no !== undefined) next.employee_contact_no = optionalText(input.employee_contact_no, "Contact number") ?? "";
    if (input.maritial_status !== undefined) next.maritial_status = optionalText(input.maritial_status, "Marital status") ?? "";
    const active = optionalBoolean(input.is_active, "is_active");
    if (active !== undefined) next.is_active = active;

    return db.transaction(async (tx) => {
        const current = await findEmployee(tx, id);
        if (!current) throw new RequestError("Employee not found.", 404);
        const renamed = next.employee_name !== undefined && next.employee_name !== current.employee_name;
        if (renamed) await assertNameFree(tx, next.employee_name!, id);

        const changes = changedFields({ ...current }, next);
        if (Object.keys(changes).length === 0) return current;

        await tx.update(employees).set(next).where(eq(employees.employee_id, id));
        let renamedEntries = 0;
        if (renamed) {
            const [result] = await tx.update(expenses)
                .set({ employee_name: next.employee_name! })
                .where(eq(expenses.employee_name, current.employee_name));
            renamedEntries = result.affectedRows;
        }
        await logActivity(tx, actor, {
            action: "employee.update",
            summary: `Updated employee "${current.employee_name}": ${describeChanges(changes, LABELS)}${renamedEntries ? ` (${renamedEntries} salary entr${renamedEntries === 1 ? "y" : "ies"} renamed)` : ""}`,
            entityType: "employee",
            entityId: id,
            details: { changes, renamed_expense_entries: renamedEntries },
        }, info);
        return (await findEmployee(tx, id))!;
    });
}
