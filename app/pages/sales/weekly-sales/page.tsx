'use client';

import SalesReport from '@/app/components/sales/sales-report';
import { toIsoDate } from '@/app/lib/dates';
import { describeRange, weekContaining } from '@/app/lib/periods';

export default function WeeklySales() {
  const { start, end } = weekContaining(new Date());
  const week = describeRange({ from: toIsoDate(start), to: toIsoDate(end) });
  return (
    <SalesReport
      title="Weekly Statements"
      description="This week's sales transactions and item metrics —"
      period={week}
      revenueLabel="Weekly Revenue"
      icon="📈"
      accent="indigo"
      idPrefix="W-SAL"
      url="/api/sales/get-weekly-sales"
      emptyText="No sales recorded this week."
      items={{ timeframe: 'weekly', title: 'Weekly Items Sold Breakdown', subtitle: `Item volume and revenue sold this week (${week})` }}
    />
  );
}
