import { describe, expect, it } from "vitest";
import { GET as activity } from "@/app/api/activity/route";
import { POST as saveSale } from "@/app/api/sales/save-sales/route";
import { POST as voidSale } from "@/app/api/sales/[id]/void/route";
import { POST as saveExpense } from "@/app/api/expenses/save-expenses/route";
import { POST as moveStock } from "@/app/api/stock/route";
import { signIn } from "@/app/services/users";
import { get, post } from "../helpers/http";
import { query } from "../helpers/test-db";

async function someActivity() {
    await signIn("staff", "wrong-pass1", { ip: "198.51.100.4", userAgent: "phone" });
    await post(saveSale, "/api/sales/save-sales", {
        customer_name: "Kamal Stores", sale_date: "2026-10-13", items: [{ product_name: "Yogurt", quantity: 2, selling_price: 80 }],
    }, { as: "staff" });
    await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Transport", per_expense_amount: 350, expense_date: "2026-10-13" }, { as: "manager" });
    await post(voidSale, "/api/sales/7/void", { reason: "Wrong customer" }, { params: { id: "7" } });
    await post(moveStock, "/api/stock", { product_id: 1, quantity: 5, note: "=HYPERLINK(\"x\")" }, { as: "staff" });
}

describe("GET /api/activity", () => {
    it("lists who did what, newest first", async () => {
        await someActivity();
        const { status, body } = await get(activity, "/api/activity");
        expect(status).toBe(200);
        expect(body.total).toBe(5);
        expect(body.rows.map((r: { action: string; username: string | null; user_name: string | null }) => [r.action, r.username, r.user_name])).toEqual([
            ["stock.movement", "staff", "Saman Staff"],
            ["sale.void", "admin", "Asha Admin"],
            ["expense.create", "manager", "Mala Manager"],
            ["sale.create", "staff", "Saman Staff"],
            ["auth.login_failed", "staff", "Saman Staff"],
        ]);
        expect(body.rows[3]).toMatchObject({
            action_label: "Invoice posted",
            entity_type: "sale",
            entity_id: "7",
            summary: "Posted invoice #7 for Kamal Stores: Rs. 160.00 (2 × Yogurt)",
            details: { customer: "Kamal Stores", grand_total: 160, items: [{ product_name: "Yogurt", quantity: 2, selling_price: 80, total: 160 }] },
        });
        expect(body.rows[4]).toMatchObject({ ip_address: "198.51.100.4", user_agent: "phone" });
    });

    it.each([
        ["user_id=4", 3],
        ["category=sales", 2],
        ["action=sale.void", 1],
        ["entity_type=sale&entity_id=7", 2],
        ["attention=1", 2],
        ["q=yogurt", 2],
        ["from=2026-10-13&to=2026-10-13", 5],
        ["from=2026-10-14", 0],
        ["page=2&page_size=2", 2],
    ])("filters by %s", async (filter, count) => {
        await someActivity();
        expect((await get(activity, `/api/activity?${filter}`)).body.rows).toHaveLength(count);
    });

    it("exports CSV with spreadsheet formulas defused", async () => {
        await someActivity();
        await signIn("=sum(1+1)", "whatever1", { ip: null, userAgent: null });
        const response = await get(activity, "/api/activity?format=csv");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/text\/csv/);
        expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="activity-log-\d{4}-\d{2}-\d{2}\.csv"/);
        const lines = String(response.body).replace(/^\uFEFF/, "").trim().split("\r\n");
        expect(lines[0]).toBe('"Time (UTC)","User","Username","Action","Summary","Record","IP address"');
        expect(lines).toHaveLength(7);
        expect(lines[1]).toContain(`"'=sum(1+1)"`);
        expect(lines[1]).toContain('"Failed sign-in"');
        expect(lines[2]).toContain('"Stock movement"');
    });

    it.each(["category=everything", "action=sale.delete", "user_id=x", "from=yesterday"])("rejects %s", async (filter) => {
        expect((await get(activity, `/api/activity?${filter}`)).status).toBe(400);
    });

    it.each([["owner", 200], ["manager", 403], ["staff", 403]] as const)("is visible to an %s: %d", async (as, status) => {
        expect((await get(activity, "/api/activity", { as })).status).toBe(status);
    });

    it("is never written to by a change that fails", async () => {
        await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Kamal Stores", sale_date: "2026-10-13", items: [{ product_name: "Curd Pot", quantity: 99, selling_price: 1 }],
        });
        expect(await query("SELECT * FROM activity_log")).toEqual([]);
    });
});
