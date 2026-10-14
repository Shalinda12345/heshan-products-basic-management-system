import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, canOpenPage, hasPermission, homePathFor, pagePermission, permissionsFor, type Permission } from "@/app/lib/permissions";

describe("roles", () => {
    it("gives administrators every permission", () => {
        expect(permissionsFor("admin").sort()).toEqual((Object.keys(PERMISSIONS) as Permission[]).sort());
    });

    it("gives owners everything except managing user accounts", () => {
        expect(hasPermission("owner", "users.manage")).toBe(false);
        expect(hasPermission("owner", "activity.view")).toBe(true);
        expect(hasPermission("owner", "reports.view")).toBe(true);
    });

    it("keeps the activity log and user accounts away from managers", () => {
        expect(hasPermission("manager", "activity.view")).toBe(false);
        expect(hasPermission("manager", "users.manage")).toBe(false);
        expect(hasPermission("manager", "sales.void")).toBe(true);
        expect(hasPermission("manager", "masterdata.manage")).toBe(true);
    });

    it("lets staff record sales, expenses and stock but nothing more", () => {
        expect(permissionsFor("staff").sort()).toEqual(["expenses.create", "sales.create", "sales.view", "stock.move", "stock.view"]);
    });

    it("treats a missing or unknown role as having no permissions", () => {
        expect(hasPermission(undefined, "sales.view")).toBe(false);
        expect(hasPermission(null, "sales.view")).toBe(false);
    });
});

describe("page rules", () => {
    it.each([
        ["/", "dashboard.view"],
        ["/pages/sales", "sales.create"],
        ["/pages/sales/invoices", "sales.view"],
        ["/pages/expenses", "expenses.create"],
        ["/pages/expenses/register", "expenses.view"],
        ["/pages/expenses/returns", "returns.manage"],
        ["/pages/stock", "stock.view"],
        ["/reports/products", "reports.view"],
        ["/admin/users", "users.manage"],
        ["/admin/activity", "activity.view"],
        ["/admin/products", "masterdata.manage"],
        ["/account", null],
        ["/forbidden", null],
        ["/pages/salesman", null],
    ])("%s needs %s", (path, permission) => {
        expect(pagePermission(path)).toBe(permission);
    });

    it("sends each role to a start page it can open", () => {
        for (const role of ROLES) {
            expect(canOpenPage(role, homePathFor(role))).toBe(true);
        }
        expect(homePathFor("staff")).toBe("/pages/sales");
        expect(homePathFor("manager")).toBe("/");
    });
});
