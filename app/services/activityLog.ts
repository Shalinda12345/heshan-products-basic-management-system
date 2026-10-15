import { and, desc, eq, exists, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { activity_log, users } from "../db/schema";
import { ACTIVITY_ACTIONS, actionsInCategory, activityLabel, type ActivityAction, type ActivityCategory } from "../lib/activity";
import { toCsv } from "../lib/csv";
import { parseLocalDate } from "../lib/dates";
import { likeContains } from "../lib/validation";

export interface ActivityFilters {
    from?: string | null;
    to?: string | null;
    userId?: number | null;
    category?: ActivityCategory | null;
    action?: ActivityAction | null;
    entityType?: string | null;
    entityId?: string | null;
    attentionOnly?: boolean;
    search?: string | null;
    page: number;
    pageSize: number;
}

export interface ActivityRow {
    activity_id: number;
    occurred_at: Date;
    user_id: number | null;
    username: string | null;
    user_name: string | null;
    action: string;
    action_label: string;
    entity_type: string | null;
    entity_id: string | null;
    summary: string;
    details: unknown;
    ip_address: string | null;
    user_agent: string | null;
}

const ATTENTION_ACTIONS = (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[]).filter((a) => "attention" in ACTIVITY_ACTIONS[a]);

function conditions(filters: ActivityFilters): SQL | undefined {
    const where: SQL[] = [];
    if (filters.from) where.push(gte(activity_log.occurred_at, parseLocalDate(filters.from)));
    if (filters.to) {
        const end = parseLocalDate(filters.to);
        end.setDate(end.getDate() + 1);
        where.push(lt(activity_log.occurred_at, end));
    }
    if (filters.userId) where.push(eq(activity_log.user_id, filters.userId));
    if (filters.category) where.push(inArray(activity_log.action, actionsInCategory(filters.category)));
    if (filters.action) where.push(eq(activity_log.action, filters.action));
    if (filters.entityType) where.push(eq(activity_log.entity_type, filters.entityType));
    if (filters.entityId) where.push(eq(activity_log.entity_id, filters.entityId));
    if (filters.attentionOnly) where.push(inArray(activity_log.action, ATTENTION_ACTIONS));
    const search = filters.search?.trim();
    if (search) {
        const like = likeContains(search);
        where.push(sql`(${activity_log.summary} LIKE ${like} OR ${activity_log.username} LIKE ${like})`);
    }
    return where.length ? and(...where) : undefined;
}

function parseDetails(text: string | null): unknown {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

// One page of the log, newest first
export async function listActivity(filters: ActivityFilters): Promise<{ rows: ActivityRow[]; total: number; page: number; page_size: number }> {
    const where = conditions(filters);
    const [rows, [{ count }]] = await Promise.all([
        db.select({ entry: activity_log, user_name: users.name })
            .from(activity_log)
            .leftJoin(users, eq(users.id, activity_log.user_id))
            .where(where)
            .orderBy(desc(activity_log.occurred_at), desc(activity_log.activity_id))
            .limit(filters.pageSize)
            .offset((filters.page - 1) * filters.pageSize),
        db.select({ count: sql<number>`COUNT(*)` }).from(activity_log).where(where),
    ]);
    return {
        rows: rows.map(({ entry, user_name }) => ({
            activity_id: Number(entry.activity_id),
            occurred_at: entry.occurred_at,
            user_id: entry.user_id,
            username: entry.username,
            user_name,
            action: entry.action,
            action_label: activityLabel(entry.action),
            entity_type: entry.entity_type,
            entity_id: entry.entity_id,
            summary: entry.summary,
            details: parseDetails(entry.details),
            ip_address: entry.ip_address,
            user_agent: entry.user_agent,
        })),
        total: Number(count),
        page: filters.page,
        page_size: filters.pageSize,
    };
}

// Everyone who appears in the log (for the "who" filter), with their current name
export async function activityUsers(): Promise<{ user_id: number; username: string | null; name: string | null }[]> {
    const rows = await db
        .select({ user_id: users.id, username: users.username, name: users.name })
        .from(users)
        .where(exists(db.select({ one: sql`1` }).from(activity_log).where(eq(activity_log.user_id, users.id))));
    return rows
        .map((row) => ({ user_id: Number(row.user_id), username: row.username, name: row.name }))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

// The log as CSV, for spreadsheet programs
export function activityCsv(rows: ActivityRow[]): string {
    return toCsv(rows, [
        { header: "Time (UTC)", value: (row) => row.occurred_at.toISOString().replace("T", " ").slice(0, 19) },
        { header: "User", value: (row) => row.user_name ?? "" },
        { header: "Username", value: (row) => row.username ?? "" },
        { header: "Action", value: (row) => row.action_label },
        { header: "Summary", value: (row) => row.summary },
        { header: "Record", value: (row) => (row.entity_type ? `${row.entity_type} ${row.entity_id ?? ""}`.trim() : "") },
        { header: "IP address", value: (row) => row.ip_address ?? "" },
    ]);
}
