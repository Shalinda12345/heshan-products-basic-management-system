"use client";

import ExpenseReport from "@/app/components/expenses/expense-report";
import { toIsoDate } from "@/app/lib/dates";
import { describeRange, weekContaining } from "@/app/lib/periods";

export default function WeeklyExpenses() {
    const { start, end } = weekContaining(new Date());
    return (
        <ExpenseReport
            title="Weekly Statements"
            description="This week's operational expenditure metrics —"
            period={describeRange({ from: toIsoDate(start), to: toIsoDate(end) })}
            totalLabel="Weekly Expenses"
            icon="📈"
            idPrefix="W-EXP"
            url="/api/expenses/get-weekly-expenses"
            emptyText="No expenses recorded this week."
        />
    );
}
