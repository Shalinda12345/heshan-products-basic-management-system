// Every API route against every role: the server enforces the permissions, not just the menus.
import { describe, expect, it } from "vitest";
import * as activity from "@/app/api/activity/route";
import * as customers from "@/app/api/customers/route";
import * as customer from "@/app/api/customers/[id]/route";
import * as dashboard from "@/app/api/dashboard/summary/route";
import * as employees from "@/app/api/employees/route";
import * as employee from "@/app/api/employees/[id]/route";
import * as categories from "@/app/api/expense-categories/route";
import * as category from "@/app/api/expense-categories/[id]/route";
import * as expense from "@/app/api/expenses/[id]/route";
import * as expenseVoid from "@/app/api/expenses/[id]/void/route";
import * as dailyExpenses from "@/app/api/expenses/get-daily-expenses/route";
import * as expenseItems from "@/app/api/expenses/get-expense-item-list/route";
import * as monthlyExpenses from "@/app/api/expenses/get-monthly-expenses/route";
import * as weeklyExpenses from "@/app/api/expenses/get-weekly-expenses/route";
import * as expenseList from "@/app/api/expenses/list/route";
import * as saveExpense from "@/app/api/expenses/save-expenses/route";
import * as saveReturn from "@/app/api/expenses/save-return-expenses/route";
import * as products from "@/app/api/products/route";
import * as product from "@/app/api/products/[id]/route";
import * as returnsList from "@/app/api/returns/route";
import * as returnVoid from "@/app/api/returns/[id]/void/route";
import * as saleVoid from "@/app/api/sales/[id]/void/route";
import * as dailySales from "@/app/api/sales/get-daily-sales/route";
import * as itemsSummary from "@/app/api/sales/get-items-summary/route";
import * as monthlySales from "@/app/api/sales/get-monthly-sales/route";
import * as saleItems from "@/app/api/sales/get-sale-items/route";
import * as salesList from "@/app/api/sales/get-sales-list/route";
import * as weeklySales from "@/app/api/sales/get-weekly-sales/route";
import * as invoices from "@/app/api/sales/invoices/route";
import * as saveSale from "@/app/api/sales/save-sales/route";
import * as stock from "@/app/api/stock/route";
import * as stockAdjust from "@/app/api/stock/adjust/route";
import * as movements from "@/app/api/stock/movements/route";
import * as users from "@/app/api/users/route";
import * as user from "@/app/api/users/[id]/route";
import * as resetPassword from "@/app/api/users/[id]/reset-password/route";
import * as signOut from "@/app/api/users/[id]/sign-out/route";
import { call } from "../helpers/http";
import type { TestUser } from "../helpers/test-db";

type Route = Record<string, unknown>;
const A = "admin", O = "owner", M = "manager", S = "staff";

// [description, module, method, path, params, body, roles allowed]
const MATRIX: [string, Route, string, string, Record<string, string>, unknown, TestUser[]][] = [
    ["dashboard", dashboard, "GET", "/api/dashboard/summary", {}, null, [A, O, M]],
    ["activity log", activity, "GET", "/api/activity", {}, null, [A, O]],
    ["users list", users, "GET", "/api/users", {}, null, [A]],
    ["create user", users, "POST", "/api/users", {}, {}, [A]],
    ["update user", user, "PATCH", "/api/users/4", { id: "4" }, {}, [A]],
    ["reset password", resetPassword, "POST", "/api/users/4/reset-password", { id: "4" }, {}, [A]],
    ["sign user out", signOut, "POST", "/api/users/4/sign-out", { id: "4" }, {}, [A]],
    ["products list", products, "GET", "/api/products", {}, null, [A, O, M, S]],
    ["create product", products, "POST", "/api/products", {}, {}, [A, O, M]],
    ["update product", product, "PATCH", "/api/products/1", { id: "1" }, {}, [A, O, M]],
    ["customers list", customers, "GET", "/api/customers", {}, null, [A, O, M, S]],
    ["create customer", customers, "POST", "/api/customers", {}, {}, [A, O, M]],
    ["update customer", customer, "PATCH", "/api/customers/1", { id: "1" }, {}, [A, O, M]],
    ["employees list", employees, "GET", "/api/employees", {}, null, [A, O, M, S]],
    ["create employee", employees, "POST", "/api/employees", {}, {}, [A, O, M]],
    ["update employee", employee, "PATCH", "/api/employees/1", { id: "1" }, {}, [A, O, M]],
    ["categories list", categories, "GET", "/api/expense-categories", {}, null, [A, O, M, S]],
    ["create category", categories, "POST", "/api/expense-categories", {}, {}, [A, O, M]],
    ["update category", category, "PATCH", "/api/expense-categories/1", { id: "1" }, {}, [A, O, M]],
    ["active categories", expenseItems, "GET", "/api/expenses/get-expense-item-list", {}, null, [A, O, M, S]],
    ["record sale", saveSale, "POST", "/api/sales/save-sales", {}, {}, [A, O, M, S]],
    ["void sale", saleVoid, "POST", "/api/sales/1/void", { id: "1" }, {}, [A, O, M]],
    ["invoice register", invoices, "GET", "/api/sales/invoices", {}, null, [A, O, M, S]],
    ["daily sales", dailySales, "GET", "/api/sales/get-daily-sales", {}, null, [A, O, M, S]],
    ["weekly sales", weeklySales, "GET", "/api/sales/get-weekly-sales", {}, null, [A, O, M, S]],
    ["monthly sales", monthlySales, "GET", "/api/sales/get-monthly-sales", {}, null, [A, O, M, S]],
    ["items summary", itemsSummary, "GET", "/api/sales/get-items-summary", {}, null, [A, O, M, S]],
    ["sale items", saleItems, "GET", "/api/sales/get-sale-items?sale_id=1", {}, null, [A, O, M, S]],
    ["sales list", salesList, "GET", "/api/sales/get-sales-list", {}, null, [A, O, M, S]],
    ["record expense", saveExpense, "POST", "/api/expenses/save-expenses", {}, {}, [A, O, M, S]],
    ["daily expenses", dailyExpenses, "GET", "/api/expenses/get-daily-expenses", {}, null, [A, O, M, S]],
    ["weekly expenses", weeklyExpenses, "GET", "/api/expenses/get-weekly-expenses", {}, null, [A, O, M]],
    ["monthly expenses", monthlyExpenses, "GET", "/api/expenses/get-monthly-expenses", {}, null, [A, O, M]],
    ["expense register", expenseList, "GET", "/api/expenses/list", {}, null, [A, O, M]],
    ["correct expense", expense, "PATCH", "/api/expenses/1", { id: "1" }, {}, [A, O, M]],
    ["void expense", expenseVoid, "POST", "/api/expenses/1/void", { id: "1" }, {}, [A, O, M]],
    ["process return", saveReturn, "POST", "/api/expenses/save-return-expenses", {}, {}, [A, O, M]],
    ["returns register", returnsList, "GET", "/api/returns", {}, null, [A, O, M]],
    ["void return", returnVoid, "POST", "/api/returns/1/void", { id: "1" }, {}, [A, O, M]],
    ["stock levels", stock, "GET", "/api/stock", {}, null, [A, O, M, S]],
    ["stock movement", stock, "POST", "/api/stock", {}, {}, [A, O, M, S]],
    ["stock ledger", movements, "GET", "/api/stock/movements", {}, null, [A, O, M, S]],
    ["stock count", stockAdjust, "POST", "/api/stock/adjust", {}, {}, [A, O, M]],
];

const ROLES: TestUser[] = [A, O, M, S];

describe.each(MATRIX)("%s", (_name, route, method, path, params, body, allowed) => {
    const handler = route[method] as (request: Request, context: unknown) => Promise<Response>;

    it.each(ROLES)(`${method} as %s`, async (role) => {
        const init = body === null ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
        const { status } = await call(handler, path, init, { as: role, params });
        if (allowed.includes(role)) {
            // Allowed through (the empty test body may still be rejected as invalid input, but not as forbidden)
            expect([401, 403]).not.toContain(status);
        } else {
            expect(status).toBe(403);
        }
    });

    it(`${method} without a session is refused`, async () => {
        const { status } = await call(handler, path, { method }, { as: null, params });
        expect(status).toBe(401);
    });
});
