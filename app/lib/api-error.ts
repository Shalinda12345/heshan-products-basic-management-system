import { DrizzleQueryError } from "drizzle-orm";

export interface ErrorResponse {
    message: string;
    status: number;
}

// Driver codes meaning the database server could not be reached or would not let us in
const CONNECTION_ERROR_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "PROTOCOL_CONNECTION_LOST",
    "ER_ACCESS_DENIED_ERROR",
    "ER_BAD_DB_ERROR",
    "ER_CON_COUNT_ERROR",
]);

// Driver codes meaning the database is reachable but older than the code: a column or table is missing
const SCHEMA_ERROR_CODES = new Set(["ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE"]);

export const DATABASE_UNAVAILABLE_MESSAGE =
    "Cannot connect to the database. Make sure the database server is running, then try again.";
export const DATABASE_OUTDATED_MESSAGE =
    "The database is missing recent updates. Run the database migration (app/run-migration.ts), then try again.";

// The driver's error code, whether the error came straight from the connection pool or wrapped by Drizzle
function driverErrorCode(error: unknown): string | undefined {
    const source = error instanceof DrizzleQueryError ? error.cause : error;
    const code = (source as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? code : undefined;
}

// An unreachable or out-of-date database won't be fixed by trying again, so it gets its own message
function databaseProblem(error: unknown): ErrorResponse | null {
    const code = driverErrorCode(error);
    if (code && CONNECTION_ERROR_CODES.has(code)) return { message: DATABASE_UNAVAILABLE_MESSAGE, status: 503 };
    if (code && SCHEMA_ERROR_CODES.has(code)) return { message: DATABASE_OUTDATED_MESSAGE, status: 500 };
    return null;
}

// Errors thrown by our own validation are safe to show to the user (400).
// Query / driver failures carry raw SQL or connection details, so log them and return a fixed message.
export function toErrorResponse(error: unknown): ErrorResponse {
    const problem = databaseProblem(error);
    if (problem) return problem;

    const isDatabaseError = error instanceof DrizzleQueryError || driverErrorCode(error) !== undefined;
    if (isDatabaseError) {
        return { message: "A database error occurred. Please try again.", status: 500 };
    }
    return { message: error instanceof Error ? error.message : "Unknown error", status: 400 };
}

// For routes that only read data: any failure is a server fault rather than bad input, so its message is never shown
export function toReadErrorResponse(error: unknown): ErrorResponse {
    return databaseProblem(error) ?? { message: "Internal Server Error", status: 500 };
}
