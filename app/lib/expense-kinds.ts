// How each expense category is entered (expenses_list.kind). Shared by the API and the pages.

export const EXPENSE_KINDS = {
    standard: { label: "Amount", description: "One amount, e.g. Electricity or Transport." },
    quantity: { label: "Quantity × rate", description: "A quantity and a price per unit, e.g. Sugar or Milk Packets." },
    salary: { label: "Salary payment", description: "Paid to an employee chosen from the employee list." },
    return: { label: "Return", description: "Opens the returns form (stock write-offs and sale returns)." },
} as const;

export type ExpenseKind = keyof typeof EXPENSE_KINDS;

export function isExpenseKind(value: unknown): value is ExpenseKind {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(EXPENSE_KINDS, value);
}

export function expenseKindLabel(kind: string): string {
    return isExpenseKind(kind) ? EXPENSE_KINDS[kind].label : kind;
}
