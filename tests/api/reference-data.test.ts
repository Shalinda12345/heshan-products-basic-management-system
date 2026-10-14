import { describe, expect, it } from "vitest";
import { GET as getCustomers } from "@/app/api/customers/route";
import { GET as getEmployees } from "@/app/api/employees/route";
import { GET as getExpenseItems } from "@/app/api/expenses/get-expense-item-list/route";
import { GET as getProducts } from "@/app/api/products/route";
import { get } from "../helpers/http";

describe("reference data", () => {
    it("lists customers (invoice customer picker)", async () => {
        const { status, body } = await get(getCustomers, "/api/customers");
        expect(status).toBe(200);
        expect(body.map((c: { customer_name: string }) => c.customer_name)).toEqual(["Kamal Stores", "Nimal Bakery", "Sunil Mart"]);
    });

    it("lists products", async () => {
        const { status, body } = await get(getProducts, "/api/products");
        expect(status).toBe(200);
        expect(body).toHaveLength(6);
        expect(body[0]).toEqual({
            product_id: 1, product_name: "Watalappan", description: "Coconut custard pudding",
            unit_price: null, unit_cost: null, reorder_level: null, is_active: true,
        });
    });

    it("lists employees (salary picker) wrapped in { success, data }", async () => {
        const { status, body } = await get(getEmployees, "/api/employees");
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.map((e: { employee_name: string }) => e.employee_name)).toEqual(["Ruwan Perera", "Sanduni Silva"]);
    });

    it("lists expense categories, including Salary types and Return", async () => {
        const { status, body } = await get(getExpenseItems, "/api/expenses/get-expense-item-list");
        expect(status).toBe(200);
        const names = body.map((e: { expense_name: string }) => e.expense_name);
        expect(names).toHaveLength(10);
        expect(names).toEqual(expect.arrayContaining(["Salary", "Salary Advance", "Salary Loan", "Return", "Sugar"]));
    });
});
