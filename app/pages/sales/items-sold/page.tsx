'use client';

import React from 'react';
import SalesNavigation from '@/app/components/sales/sales-navigation/page';
import ItemsSoldSummary from '@/app/components/sales/items-sold-summary/page';

export default function ItemsSoldPage() {
    return (
        <main className="page-wrapper min-h-screen bg-slate-950">
            <div className="page-glow" />
            <SalesNavigation />
            <div className="page-content max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">
                {/* Header Block */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between section-divider pb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">
                            📦 Items Sold Intelligence
                        </h1>
                        <p className="text-sm text-slate-400 mt-2">
                            Analyze exact item quantities, demand volume, and revenue across any timeframe.
                        </p>
                    </div>
                </div>

                {/* Main Items Sold Component with full interactive timeframe selector */}
                <ItemsSoldSummary showTimeframeSelector={true} />
            </div>
        </main>
    );
}
