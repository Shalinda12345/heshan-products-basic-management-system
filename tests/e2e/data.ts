// Expected values for E2E assertions, read straight from the test database.
// Date bounds are inclusive "YYYY-MM-DD" strings (see weekRange / monthRange in helpers/test-db).
import { query } from "../helpers/test-db";

type Range = [string, string];

export async function salesTotal([from, to]: Range): Promise<number> {
    const [row] = await query<{ total: number | null }>("SELECT SUM(grand_total) AS total FROM sales WHERE sale_date BETWEEN ? AND ?", [from, to]);
    return Number(row.total ?? 0);
}

export async function expensesTotal([from, to]: Range): Promise<number> {
    const [row] = await query<{ total: number | null }>("SELECT SUM(total) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?", [from, to]);
    return Number(row.total ?? 0);
}

export async function saleIds([from, to]: Range): Promise<number[]> {
    const rows = await query<{ sale_id: number }>("SELECT sale_id FROM sales WHERE sale_date BETWEEN ? AND ? ORDER BY sale_id", [from, to]);
    return rows.map((r) => r.sale_id);
}

export async function expenseCount([from, to]: Range): Promise<number> {
    const [row] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM expenses WHERE expense_date BETWEEN ? AND ?", [from, to]);
    return Number(row.n);
}

export async function uniqueCustomers([from, to]: Range): Promise<number> {
    const [row] = await query<{ n: number }>("SELECT COUNT(DISTINCT customer_name) AS n FROM sales WHERE sale_date BETWEEN ? AND ?", [from, to]);
    return Number(row.n);
}

export async function unitsSold([from, to]: Range): Promise<number> {
    const [row] = await query<{ units: number | null }>(
        "SELECT SUM(si.quantity) AS units FROM sale_items si JOIN sales s ON s.sale_id = si.sale_id WHERE s.sale_date BETWEEN ? AND ?",
        [from, to]
    );
    return Number(row.units ?? 0);
}

// Adds a sale dated `date` (stock untouched), for reports that need data on a specific day
export async function addSale(date: string, customer: string, lines: [product: string, quantity: number, price: number][]): Promise<number> {
    const total = lines.reduce((sum, [, quantity, price]) => sum + quantity * price, 0);
    const result = (await query("INSERT INTO sales (customer_name, grand_total, sale_date) VALUES (?, ?, ?)", [customer, total, date])) as unknown as { insertId: number };
    for (const [product, quantity, price] of lines) {
        await query("INSERT INTO sale_items (sale_id, product_name, quantity, selling_price, total) VALUES (?, ?, ?, ?, ?)", [result.insertId, product, quantity, price, quantity * price]);
    }
    return result.insertId;
}
