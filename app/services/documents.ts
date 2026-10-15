// What invoices, expenses and returns have in common: they are posted or void (never deleted), and
// the registers show who recorded and who voided each one.
import { sql, type SQL } from "drizzle-orm";
import { alias, type MySqlColumn } from "drizzle-orm/mysql-core";
import { users } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { requiredText } from "../lib/validation";
import type { Actor } from "./activity";

// The reason given for voiding a document
export function voidReason(input: unknown, document: "invoice" | "expense" | "return"): string {
    const reason = requiredText(input, "A reason for voiding");
    if (reason.length < 3) throw new RequestError(`Please give a short reason for voiding this ${document}.`);
    return reason;
}

// The column values that mark a document void
export function voidedColumns(actor: Actor, reason: string) {
    return { status: "void" as const, void_reason: reason.slice(0, 255), voided_at: new Date(), voided_by: actor.id };
}

// The users table joined twice in the registers: who recorded a document, and who voided it
export const createdByUser = alias(users, "created_by_user");
export const voidedByUser = alias(users, "voided_by_user");

// A register's totals across all its pages: every document, and the number and amount of the posted ones
export function postedTotals(posted: SQL, amount: MySqlColumn) {
    return {
        count: sql<number>`COUNT(*)`,
        posted_count: sql<number>`COALESCE(SUM(CASE WHEN ${posted} THEN 1 ELSE 0 END), 0)`,
        posted_total: sql<number>`COALESCE(SUM(CASE WHEN ${posted} THEN ${amount} ELSE 0 END), 0)`,
    };
}
