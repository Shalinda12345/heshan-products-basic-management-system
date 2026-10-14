// Stock movement vocabulary shared by the API and the pages (no server-only imports here).

export type StockDirection = "IN" | "OUT";

// Below this many units a product is flagged as low stock
export const LOW_STOCK_THRESHOLD = 10;

export const MOVEMENT_TYPES = {
    // Stock in
    production: { direction: "IN", label: "Production / Received" },
    adjustment_in: { direction: "IN", label: "Count Correction (+)" },
    sale_return: { direction: "IN", label: "Sale Return" },
    opening_balance: { direction: "IN", label: "Opening Balance" },
    // Stock out
    sale: { direction: "OUT", label: "Sale" },
    damaged: { direction: "OUT", label: "Damaged / Expired" },
    internal_use: { direction: "OUT", label: "Internal Use" },
    adjustment_out: { direction: "OUT", label: "Count Correction (−)" },
    write_off: { direction: "OUT", label: "Stock Expense Return" },
} as const satisfies Record<string, { direction: StockDirection; label: string }>;

export type MovementType = keyof typeof MOVEMENT_TYPES;

// Reasons a user can pick when recording stock in/out by hand on the Stock page.
// Sales, sale returns and write-offs are recorded automatically by their own screens.
export const MANUAL_MOVEMENT_TYPES: Record<StockDirection, MovementType[]> = {
    IN: ["production", "adjustment_in"],
    OUT: ["damaged", "internal_use", "adjustment_out"],
};

export function movementLabel(type: string): string {
    return MOVEMENT_TYPES[type as MovementType]?.label ?? type;
}

export function stockStatus(quantity: number): "out" | "low" | "ok" {
    if (quantity <= 0) return "out";
    if (quantity < LOW_STOCK_THRESHOLD) return "low";
    return "ok";
}
