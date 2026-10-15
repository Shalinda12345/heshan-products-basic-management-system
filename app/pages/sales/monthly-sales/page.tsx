'use client';

import SalesReport from '@/app/components/sales/sales-report';
import { MONTH_NAMES } from '@/app/lib/format';

export default function MonthlySales() {
  const now = new Date();
  const month = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  return (
    <SalesReport
      title="Monthly Fiscal Audits"
      description="Cumulative sales metrics and item volumes for"
      period={month}
      revenueLabel="Monthly Volume"
      icon="💼"
      accent="emerald"
      idPrefix="M-SAL"
      url="/api/sales/get-monthly-sales"
      emptyText={`No sales recorded in ${month}.`}
      items={{
        timeframe: 'monthly',
        selectedYear: now.getFullYear(),
        selectedMonth: now.getMonth() + 1,
        title: 'Monthly Items Sold Breakdown',
        subtitle: `Item volume and revenue sold in ${month}`,
      }}
    />
  );
}
