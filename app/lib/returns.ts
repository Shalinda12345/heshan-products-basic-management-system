// Return types shared by the API and the pages (no server-only imports here).

export const RETURN_TYPES = {
    stock_expense_return: {
        label: "Stock Expense Return",
        description: "Stock is reduced and an expense entry is recorded.",
    },
    sale_reduction_return: {
        label: "Sale Reduction Return",
        description: "The invoice is reduced and the returned goods go back into stock.",
    },
    sale_reduction_expense_return: {
        label: "Sale Reduction Expense Return",
        description: "The invoice is reduced and the goods are written off as an expense (no stock credit).",
    },
} as const;

export type ReturnType = keyof typeof RETURN_TYPES;

export function isReturnType(value: unknown): value is ReturnType {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(RETURN_TYPES, value);
}

export function returnTypeLabel(type: string): string {
    return isReturnType(type) ? RETURN_TYPES[type].label : type;
}
