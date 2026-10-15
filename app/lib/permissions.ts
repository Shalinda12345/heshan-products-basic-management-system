// Roles and permissions, shared by the proxy, the API routes and the pages (no server-only imports here).
// The API routes are the real gatekeepers; pages and menus use the same rules to hide what a user can't do.

export const ROLES = ["admin", "owner", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
    "dashboard.view": "See the business dashboard",
    "reports.view": "See financial reports (profit, products, customers, expenses, stock value)",
    "sales.view": "See invoices and sales reports",
    "sales.create": "Record sales",
    "sales.void": "Void invoices",
    "returns.manage": "Process and void returns",
    "expenses.view": "See all expenses",
    "expenses.create": "Record expenses",
    "expenses.edit": "Correct and void expenses",
    "stock.view": "See stock levels and the stock ledger",
    "stock.move": "Record stock in and out",
    "stock.adjust": "Correct stock to a physical count",
    "masterdata.manage": "Manage products, customers, employees and expense categories",
    "users.manage": "Manage user accounts",
    "activity.view": "See the activity log",
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
    admin: ALL_PERMISSIONS,
    owner: ALL_PERMISSIONS.filter((p) => p !== "users.manage"),
    manager: ALL_PERMISSIONS.filter((p) => p !== "users.manage" && p !== "activity.view"),
    staff: ["sales.view", "sales.create", "expenses.create", "stock.view", "stock.move"],
};

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
    admin: {
        label: "Administrator",
        description: "Full control, including user accounts.",
    },
    owner: {
        label: "Owner",
        description: "Everything in the business, including reports and the activity log. Cannot manage user accounts.",
    },
    manager: {
        label: "Manager",
        description: "Runs day-to-day operations: sales, expenses, returns, stock, products and customers, and sees reports.",
    },
    staff: {
        label: "Staff",
        description: "Records sales, expenses and stock movements.",
    },
};

export function isRole(value: unknown): value is Role {
    return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function permissionsFor(role: Role): Permission[] {
    return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
    return !!role && (ROLE_PERMISSIONS[role]?.includes(permission) ?? false);
}

// Unit costs (and the margins and stock values built on them) are shown to those who see the reports or keep
// the product list
export function canSeeCosts(role: Role | null | undefined): boolean {
    return hasPermission(role, "reports.view") || hasPermission(role, "masterdata.manage");
}

// ─── Pages ────────────────────────────────────────────────────────────────────

// First matching rule wins. Pages without a rule only need a signed-in user.
const PAGE_RULES: { path: string; exact?: boolean; permission: Permission }[] = [
    { path: "/", exact: true, permission: "dashboard.view" },
    { path: "/pages/sales", exact: true, permission: "sales.create" },
    { path: "/pages/sales", permission: "sales.view" },
    { path: "/pages/expenses", exact: true, permission: "expenses.create" },
    { path: "/pages/expenses/returns", permission: "returns.manage" },
    { path: "/pages/expenses", permission: "expenses.view" },
    { path: "/pages/stock", permission: "stock.view" },
    { path: "/reports", permission: "reports.view" },
    { path: "/admin/users", permission: "users.manage" },
    { path: "/admin/activity", permission: "activity.view" },
    { path: "/admin", permission: "masterdata.manage" },
];

export function pagePermission(pathname: string): Permission | null {
    const rule = PAGE_RULES.find((r) =>
        r.exact ? pathname === r.path : pathname === r.path || pathname.startsWith(`${r.path}/`)
    );
    return rule?.permission ?? null;
}

export function canOpenPage(role: Role | null | undefined, pathname: string): boolean {
    const permission = pagePermission(pathname);
    return permission === null || hasPermission(role, permission);
}

// Where a user lands after signing in, or when they open a page their role can't use
export function homePathFor(role: Role): string {
    return ["/", "/pages/sales", "/pages/stock"].find((path) => canOpenPage(role, path)) ?? "/account";
}
