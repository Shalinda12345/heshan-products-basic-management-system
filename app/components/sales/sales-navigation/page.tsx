'use client';

export default function SalesNavigation() {
    return (
        <nav className="mb-8">
            <ul className="flex flex-wrap gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-600 rounded-lg p-2 text-sm border border-blue-100 dark:border-slate-600">
                <li>
                    <a href="/pages/sales" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200">
                        📝 New Sale
                    </a>
                </li>
                <li>
                    <a href="/pages/sales/daily-sales" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-white/60 dark:hover:bg-slate-700/60 font-medium transition-all duration-200">
                        📊 Daily
                    </a>
                </li>
                <li>
                    <a href="/pages/sales/weekly-sales" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-white/60 dark:hover:bg-slate-700/60 font-medium transition-all duration-200">
                        📈 Weekly
                    </a>
                </li>
                <li>
                    <a
                        href="/pages/sales/monthly-sales"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-white/60 dark:hover:bg-slate-700/60 font-medium transition-all duration-200"
                    >
                        📅 Monthly
                    </a>
                </li>
            </ul>
        </nav>
    );
}