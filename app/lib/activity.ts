// Activity log vocabulary shared by the API and the pages (no server-only imports here).

export const ACTIVITY_CATEGORIES = {
    access: "Sign-ins",
    users: "User accounts",
    sales: "Sales",
    returns: "Returns",
    expenses: "Expenses",
    stock: "Stock",
    master_data: "Products, customers & lists",
} as const;

export type ActivityCategory = keyof typeof ACTIVITY_CATEGORIES;

// `attention` marks entries an owner should notice: failed sign-ins, voids, corrections, account changes
export const ACTIVITY_ACTIONS = {
    "auth.login": { label: "Signed in", category: "access" },
    "auth.login_failed": { label: "Failed sign-in", category: "access", attention: true },
    "auth.logout": { label: "Signed out", category: "access" },
    "auth.password_changed": { label: "Changed own password", category: "access" },
    "user.create": { label: "User created", category: "users", attention: true },
    "user.update": { label: "User updated", category: "users", attention: true },
    "user.password_reset": { label: "Password reset", category: "users", attention: true },
    "user.sign_out": { label: "User signed out everywhere", category: "users" },
    "sale.create": { label: "Invoice posted", category: "sales" },
    "sale.void": { label: "Invoice voided", category: "sales", attention: true },
    "return.create": { label: "Return processed", category: "returns" },
    "return.void": { label: "Return voided", category: "returns", attention: true },
    "expense.create": { label: "Expense recorded", category: "expenses" },
    "expense.update": { label: "Expense corrected", category: "expenses", attention: true },
    "expense.void": { label: "Expense voided", category: "expenses", attention: true },
    "stock.movement": { label: "Stock movement", category: "stock" },
    "stock.count": { label: "Stock count correction", category: "stock", attention: true },
    "product.create": { label: "Product added", category: "master_data" },
    "product.update": { label: "Product updated", category: "master_data" },
    "customer.create": { label: "Customer added", category: "master_data" },
    "customer.update": { label: "Customer updated", category: "master_data" },
    "employee.create": { label: "Employee added", category: "master_data" },
    "employee.update": { label: "Employee updated", category: "master_data" },
    "expense_category.create": { label: "Expense category added", category: "master_data" },
    "expense_category.update": { label: "Expense category updated", category: "master_data" },
} as const satisfies Record<string, { label: string; category: ActivityCategory; attention?: boolean }>;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

export function isActivityAction(value: unknown): value is ActivityAction {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTIVITY_ACTIONS, value);
}

export function activityLabel(action: string): string {
    return isActivityAction(action) ? ACTIVITY_ACTIONS[action].label : action;
}

export function activityNeedsAttention(action: string): boolean {
    return isActivityAction(action) && "attention" in ACTIVITY_ACTIONS[action];
}

export function actionsInCategory(category: ActivityCategory): ActivityAction[] {
    return (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[]).filter((a) => ACTIVITY_ACTIONS[a].category === category);
}

// A field that changed in an edit: { from, to }
export type FieldChange = { from: unknown; to: unknown };
