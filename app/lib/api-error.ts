import { DrizzleQueryError } from "drizzle-orm";

// Errors thrown by our own validation are safe to show to the user (400).
// Query / driver failures carry raw SQL or connection details, so log them and return a generic 500.
export function toErrorResponse(error: unknown): { message: string; status: number } {
    const isDatabaseError =
        error instanceof DrizzleQueryError ||
        (error instanceof Error && typeof (error as { code?: unknown }).code === "string");

    if (isDatabaseError) {
        return { message: "A database error occurred. Please try again.", status: 500 };
    }
    return { message: error instanceof Error ? error.message : "Unknown error", status: 400 };
}
