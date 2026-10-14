import { describe, expect, it } from "vitest";
import { GET as listProducts, POST as createProduct } from "@/app/api/products/route";
import { PATCH as updateProduct } from "@/app/api/products/[id]/route";
import { GET as listCustomers, POST as createCustomer } from "@/app/api/customers/route";
import { PATCH as updateCustomer } from "@/app/api/customers/[id]/route";
import { GET as listEmployees, POST as createEmployee } from "@/app/api/employees/route";
import { PATCH as updateEmployee } from "@/app/api/employees/[id]/route";
import { GET as listCategories, POST as createCategory } from "@/app/api/expense-categories/route";
import { PATCH as updateCategory } from "@/app/api/expense-categories/[id]/route";
import { GET as activeCategories } from "@/app/api/expenses/get-expense-item-list/route";
import { POST as saveSale } from "@/app/api/sales/save-sales/route";
import { POST as saveExpense } from "@/app/api/expenses/save-expenses/route";
import { GET as itemsSummary } from "@/app/api/sales/get-items-summary/route";
import { get, patch, post } from "../helpers/http";
import { activityLog, query, stockOf } from "../helpers/test-db";

describe("products", () => {
    it("adds a product with prices, a reorder level and opening stock", async () => {
        const { status, body } = await post(createProduct, "/api/products", {
            product_name: " Jelly Cup ", description: "Strawberry", unit_price: "120", unit_cost: 70.456, reorder_level: 15, opening_stock: 40,
        });
        expect(status).toBe(201);
        expect(body.data).toEqual({
            product_id: 7, product_name: "Jelly Cup", description: "Strawberry", unit_price: 120, unit_cost: 70.46, reorder_level: 15, is_active: true,
        });
        expect(await stockOf(7)).toBe(40);
        expect(await query("SELECT movement_type, quantity, reference, created_by FROM stock_movements")).toEqual([
            { movement_type: "opening_balance", quantity: 40, reference: "Opening stock", created_by: 1 },
        ]);
        const [entry] = await activityLog();
        expect(entry).toMatchObject({ action: "product.create", entity_id: "7", summary: 'Added product "Jelly Cup" at Rs. 120.00 with 40 in stock' });
    });

    it("refuses a second product with the same name, whatever the case", async () => {
        const { status, body } = await post(createProduct, "/api/products", { product_name: "yogurt" });
        expect(status).toBe(409);
        expect(body.message).toBe('A product named "Yogurt" already exists.');
    });

    it.each([
        ["no name", { product_name: "  " }, /Product name is required/],
        ["a negative price", { product_name: "X", unit_price: -1 }, /Selling price must be a number of 0 or more/],
        ["a non-numeric cost", { product_name: "X", unit_cost: "cheap" }, /Unit cost must be a number/],
    ])("rejects %s", async (_label, input, message) => {
        const { status, body } = await post(createProduct, "/api/products", input);
        expect(status).toBe(400);
        expect(body.message).toMatch(message);
    });

    it("updates fields and logs exactly what changed", async () => {
        const { status, body } = await patch(updateProduct, "/api/products/1", { unit_price: 160, unit_cost: 95, description: "Coconut custard pudding" }, { params: { id: "1" } });
        expect(status).toBe(200);
        expect(body.data).toMatchObject({ unit_price: 160, unit_cost: 95 });
        const [entry] = await activityLog();
        expect(entry.summary).toBe('Updated product "Watalappan": price (blank) → Rs. 160.00, unit cost (blank) → Rs. 95.00');
        expect(entry.details).toEqual({ changes: { unit_price: { from: null, to: 160 }, unit_cost: { from: null, to: 95 } } });
    });

    it("keeps sales history together when a product is renamed", async () => {
        await patch(updateProduct, "/api/products/1", { product_name: "Watalappan Cup" }, { params: { id: "1" } });
        await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Kamal Stores", sale_date: "2026-10-12", items: [{ product_id: 1, product_name: "Watalappan Cup", quantity: 2, selling_price: 150 }],
        });
        const { body } = await get(itemsSummary, "/api/sales/get-items-summary?timeframe=daily&date=2026-10-12");
        expect(body.items.map((i: { product_name: string; quantity: number }) => [i.product_name, i.quantity])).toEqual([["Watalappan Cup", 12], ["Yogurt", 5]]);
    });

    it("hides inactive products from the pickers and refuses to sell them", async () => {
        await patch(updateProduct, "/api/products/2", { is_active: false }, { params: { id: "2" } });
        expect((await get(listProducts, "/api/products")).body.map((p: { product_name: string }) => p.product_name)).not.toContain("Yogurt");
        expect((await get(listProducts, "/api/products?include_inactive=1")).body).toHaveLength(6);
        const { status, body } = await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Kamal Stores", sale_date: "2026-10-13", items: [{ product_name: "Yogurt", quantity: 1, selling_price: 80 }],
        });
        expect(status).toBe(400);
        expect(body.message).toBe('Product "Yogurt" is no longer sold (inactive).');
    });

    it("shows unit costs only to those who see margins", async () => {
        await patch(updateProduct, "/api/products/1", { unit_cost: 95 }, { params: { id: "1" } });
        const cost = async (as: "manager" | "staff") => (await get(listProducts, "/api/products", { as })).body[0].unit_cost;
        expect(await cost("manager")).toBe(95);
        expect(await cost("staff")).toBeNull();
    });

    it("can only be changed by those who manage master data", async () => {
        expect((await post(createProduct, "/api/products", { product_name: "X" }, { as: "staff" })).status).toBe(403);
        expect((await patch(updateProduct, "/api/products/1", { unit_price: 1 }, { as: "staff", params: { id: "1" } })).status).toBe(403);
        expect((await post(createProduct, "/api/products", { product_name: "Kiri Toffee" }, { as: "manager" })).status).toBe(201);
    });
});

describe("customers", () => {
    it("adds a customer who can then be invoiced", async () => {
        const { status, body } = await post(createCustomer, "/api/customers", { customer_name: "Lanka Foods", phone: "0112 345 678", address: "Galle" });
        expect(status).toBe(201);
        expect(body.data).toMatchObject({ customer_id: 4, customer_name: "Lanka Foods", phone: "0112 345 678", is_active: true });
        const sale = await post(saveSale, "/api/sales/save-sales", {
            customer_id: 4, customer_name: "Lanka Foods", sale_date: "2026-10-13", items: [{ product_name: "Yogurt", quantity: 1, selling_price: 80 }],
        });
        expect(sale.status).toBe(201);
        expect((await query("SELECT customer_id, customer_name FROM sales WHERE sale_id = ?", [sale.body.sale_id]))[0]).toEqual({ customer_id: 4, customer_name: "Lanka Foods" });
    });

    it("refuses to invoice a customer who is not on the list", async () => {
        const { status, body } = await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Walk-in", sale_date: "2026-10-13", items: [{ product_name: "Yogurt", quantity: 1, selling_price: 80 }],
        });
        expect(status).toBe(400);
        expect(body.message).toBe('Customer "Walk-in" not found. Add them to the customer list first.');
    });

    it("refuses to invoice an inactive customer", async () => {
        await patch(updateCustomer, "/api/customers/3", { is_active: false }, { params: { id: "3" } });
        const { body } = await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Sunil Mart", sale_date: "2026-10-13", items: [{ product_name: "Yogurt", quantity: 1, selling_price: 80 }],
        });
        expect(body.message).toMatch(/is inactive/);
        expect((await get(listCustomers, "/api/customers")).body.map((c: { customer_name: string }) => c.customer_name)).toEqual(["Kamal Stores", "Nimal Bakery"]);
    });

    it("lists customers with what they bought (posted invoices only)", async () => {
        await query("UPDATE sales SET status = 'void' WHERE sale_id = 4");
        const { status, body } = await get(listCustomers, "/api/customers?with_activity=1");
        expect(status).toBe(200);
        expect(body.find((c: { customer_name: string }) => c.customer_name === "Kamal Stores")).toMatchObject({
            invoices: 1, total_sales: 1900, last_purchase: "2026-10-12",
        });
        expect((await get(listCustomers, "/api/customers?with_activity=1", { as: "staff" })).status).toBe(403);
    });

    it("refuses a duplicate name on rename", async () => {
        const { status } = await patch(updateCustomer, "/api/customers/1", { customer_name: "NIMAL BAKERY" }, { params: { id: "1" } });
        expect(status).toBe(409);
    });
});

describe("employees", () => {
    it("adds an employee who can then be paid", async () => {
        const { status } = await post(createEmployee, "/api/employees", { employee_name: "Kasun Fernando", employee_contact_no: "0770000000" });
        expect(status).toBe(201);
        const paid = await post(saveExpense, "/api/expenses/save-expenses", {
            expense_name: "Salary", employee_name: "Kasun Fernando", per_expense_amount: 40000, expense_date: "2026-10-13",
        });
        expect(paid.status).toBe(201);
    });

    it("renames the employee on their past salary entries too", async () => {
        await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Salary", employee_name: "Ruwan Perera", per_expense_amount: 1000, expense_date: "2026-10-13" });
        await patch(updateEmployee, "/api/employees/1", { employee_name: "Ruwan K. Perera" }, { params: { id: "1" } });
        expect(await query("SELECT employee_name FROM expenses WHERE expense_name = 'Salary'")).toEqual([{ employee_name: "Ruwan K. Perera" }]);
        expect((await activityLog()).at(-1)?.summary).toBe('Updated employee "Ruwan Perera": name "Ruwan Perera" → "Ruwan K. Perera" (1 salary entry renamed)');
    });

    it("gives contact details only to those who manage employees", async () => {
        expect(Object.keys((await get(listEmployees, "/api/employees", { as: "staff" })).body.data[0]).sort()).toEqual(["employee_id", "employee_name", "is_active"]);
        expect((await get(listEmployees, "/api/employees")).body.data[0]).toHaveProperty("employee_contact_no");
    });

    it("refuses salary payments to someone who is not an employee", async () => {
        const { status, body } = await post(saveExpense, "/api/expenses/save-expenses", {
            expense_name: "Salary", employee_name: "Stranger", per_expense_amount: 100, expense_date: "2026-10-13",
        });
        expect(status).toBe(400);
        expect(body.message).toBe('Employee "Stranger" not found.');
    });
});

describe("expense categories", () => {
    it("adds a category with how it is entered", async () => {
        const { status, body } = await post(createCategory, "/api/expense-categories", { expense_name: "Coconuts", kind: "quantity" });
        expect(status).toBe(201);
        expect(body.data).toEqual({ expense_id: 11, expense_name: "Coconuts", kind: "quantity", is_active: true });
        expect((await get(activeCategories, "/api/expenses/get-expense-item-list")).body.at(-1)).toMatchObject({ expense_name: "Coconuts", kind: "quantity" });
    });

    it("rejects an unknown kind", async () => {
        const { status, body } = await post(createCategory, "/api/expense-categories", { expense_name: "X", kind: "fancy" });
        expect(status).toBe(400);
        expect(body.message).toMatch(/Category type must be one of/);
    });

    it("relabels past expenses when renamed", async () => {
        await patch(updateCategory, "/api/expense-categories/1", { expense_name: "Electricity Bill" }, { params: { id: "1" } });
        expect(await query("SELECT COUNT(*) AS n FROM expenses WHERE expense_name = 'Electricity Bill'")).toEqual([{ n: 2 }]);
    });

    it("stops new entries in a deactivated category", async () => {
        await patch(updateCategory, "/api/expense-categories/2", { is_active: false }, { params: { id: "2" } });
        expect((await get(activeCategories, "/api/expenses/get-expense-item-list")).body.map((c: { expense_name: string }) => c.expense_name)).not.toContain("Transport");
        expect((await get(listCategories, "/api/expense-categories?include_inactive=1")).body).toHaveLength(10);
        const { status, body } = await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Transport", per_expense_amount: 100, expense_date: "2026-10-13" });
        expect(status).toBe(400);
        expect(body.message).toBe('The expense category "Transport" is no longer in use.');
    });

    it("refuses expenses in categories that don't exist, and returns as plain expenses", async () => {
        expect((await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Lunch", per_expense_amount: 100, expense_date: "2026-10-13" })).body.message)
            .toBe('"Lunch" is not an expense category. Add it to the category list first.');
        expect((await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Return", per_expense_amount: 100, expense_date: "2026-10-13" })).body.message)
            .toMatch(/return form/);
    });
});
