'use client';

import { useState } from 'react';
import SalesReport from '@/app/components/sales/sales-report';
import MonthSelector from '@/app/components/ui/month-selector';
import { MONTH_NAMES } from '@/app/lib/format';

export default function CustomSales() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const month = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
  return (
    <SalesReport
      title="Custom Sales Report"
      description="Sales transactions and item metrics for"
      period={month}
      revenueLabel="Period Revenue"
      icon="🔍"
      accent="blue"
      idPrefix="C-SAL"
      url={`/api/sales/get-monthly-sales?year=${selectedYear}&month=${selectedMonth}`}
      emptyText={`No sales recorded in ${month}.`}
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
      items={{
        timeframe: 'custom',
        selectedYear,
        selectedMonth,
        title: 'Custom Period Items Sold Breakdown',
        subtitle: `Item volume and revenue sold in ${month}`,
      }}
    />
  );
}
