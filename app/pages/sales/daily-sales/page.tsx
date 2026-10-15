'use client';

import SalesReport from '@/app/components/sales/sales-report';
import { formatDate } from '@/app/lib/format';

export default function DailySales() {
  const today = formatDate(new Date());
  return (
    <SalesReport
      title="Daily Performance"
      description="Today's sales transactions and item metrics —"
      period={today}
      revenueLabel="Today's Revenue"
      icon="📊"
      accent="blue"
      idPrefix="SAL"
      url="/api/sales/get-daily-sales"
      emptyText="No sales recorded today."
      items={{ timeframe: 'daily', title: "Today's Items Sold Breakdown", subtitle: `Item volume and revenue sold today (${today})` }}
    />
  );
}
