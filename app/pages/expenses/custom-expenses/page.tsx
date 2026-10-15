"use client";

import { useState } from "react";
import ExpenseReport from "@/app/components/expenses/expense-report";
import MonthSelector from "@/app/components/ui/month-selector";
import { MONTH_NAMES } from "@/app/lib/format";

export default function CustomExpenses() {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const month = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
    return (
        <ExpenseReport
            title="Custom Expenditure Report"
            description="Expense log for"
            period={month}
            totalLabel="Period Expenses"
            icon="🔍"
            idPrefix="C-EXP"
            url={`/api/expenses/get-monthly-expenses?year=${selectedYear}&month=${selectedMonth}`}
            emptyText={`No expenses recorded in ${month}.`}
            controls={
                <MonthSelector
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    onChange={(year, month) => {
                        setSelectedYear(year);
                        setSelectedMonth(month);
                    }}
                />
            }
        />
    );
}
