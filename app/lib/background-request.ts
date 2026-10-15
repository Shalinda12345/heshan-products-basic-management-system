// Sent by automatic background refreshes (live stock, dashboard). The proxy does not treat them as
// user activity, so a screen left open doesn't keep its session alive forever.
// Kept apart from session.ts so the pages don't pull the session-signing code into the browser.
export const BACKGROUND_REQUEST_HEADER = "x-background-refresh";
