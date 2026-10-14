import { activity_log } from "../db/schema";
import type { DbExecutor } from "../db";
import type { ActivityAction, FieldChange } from "../lib/activity";

// Who did it: a signed-in user, or (for failed sign-ins) just the username that was tried
export interface Actor {
    id: number | null;
    username: string | null;
}

export interface RequestInfo {
    ip: string | null;
    userAgent: string | null;
}

export interface ActivityEntry {
    action: ActivityAction;
    summary: string;
    entityType?: string;
    entityId?: string | number | null;
    details?: Record<string, unknown> | null;
}

export function requestInfo(source: Request | Headers | null | undefined): RequestInfo {
    const headers = source instanceof Request ? source.headers : source;
    if (!headers) return { ip: null, userAgent: null };
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
        ip: (forwarded || headers.get("x-real-ip") || null)?.slice(0, 64) ?? null,
        userAgent: headers.get("user-agent")?.slice(0, 255) || null,
    };
}

// Records one entry. Pass the transaction that makes the change, so the entry is saved if and only if the change is.
export async function logActivity(executor: DbExecutor, actor: Actor | null, entry: ActivityEntry, info?: RequestInfo): Promise<void> {
    await executor.insert(activity_log).values({
        occurred_at: new Date(),
        user_id: actor?.id ?? null,
        username: actor?.username?.slice(0, 50) ?? null,
        action: entry.action,
        entity_type: entry.entityType ?? null,
        entity_id: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
        summary: entry.summary.slice(0, 500),
        details: entry.details ? JSON.stringify(entry.details) : null,
        ip_address: info?.ip ?? null,
        user_agent: info?.userAgent ?? null,
    });
}

// The fields whose value differs between two versions of a record, as { field: { from, to } }
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, FieldChange> {
    const changes: Record<string, FieldChange> = {};
    for (const key of Object.keys(after)) {
        const from = normalise(before[key]);
        const to = normalise(after[key]);
        if (from !== to) changes[key] = { from, to };
    }
    return changes;
}

function normalise(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (value === undefined) return null;
    return value;
}

function plainValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "(blank)";
    return typeof value === "string" ? `"${value}"` : String(value);
}

// "price Rs. 150.00 → Rs. 160.00, deactivated" for the summary line of an edit
export function describeChanges(
    changes: Record<string, FieldChange>,
    labels: Record<string, string>,
    format: (field: string, value: unknown) => string | undefined = () => undefined
): string {
    return Object.entries(changes).map(([field, { from, to }]) => {
        if (field === "is_active") return to ? "reactivated" : "deactivated";
        const show = (value: unknown) => format(field, value) ?? plainValue(value);
        return `${labels[field] ?? field} ${show(from)} → ${show(to)}`;
    }).join(", ");
}
