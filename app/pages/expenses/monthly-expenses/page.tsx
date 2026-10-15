"use client";

import ExpenseReport from "@/app/components/expenses/expense-report";
import { MONTH_NAMES } from "@/app/lib/format";

export default function MonthlyExpenses() {
    const now = new Date();
    const month = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    return (
        <ExpenseReport
            title="Monthly Fiscal Audits"
            description="Cumulative expenditure metrics for"
            period={month}
            totalLabel="Monthly Total"
            icon="💼"
            idPrefix="M-EXP"
            url="/api/expenses/get-monthly-expenses"
            emptyText={`No expenses recorded in ${month}.`}
        />
    );
}
