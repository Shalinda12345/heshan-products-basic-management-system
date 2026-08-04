'use client';

import React from 'react';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface MonthSelectorProps {
  selectedYear: number;
  selectedMonth: number; // 1 - 12
  onChange: (year: number, month: number) => void;
  className?: string;
}

export default function MonthSelector({
  selectedYear,
  selectedMonth,
  onChange,
  className = '',
}: MonthSelectorProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Generate list of years (e.g. 2022 to currentYear + 3)
  const years = Array.from(
    { length: Math.max(currentYear - 2022 + 4, 6) },
    (_, i) => 2022 + i
  );

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      onChange(selectedYear - 1, 12);
    } else {
      onChange(selectedYear, selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      onChange(selectedYear + 1, 1);
    } else {
      onChange(selectedYear, selectedMonth + 1);
    }
  };

  const handleResetToCurrent = () => {
    onChange(currentYear, currentMonth);
  };

  const isCurrentMonth =
    selectedYear === currentYear && selectedMonth === currentMonth;

  return (
    <div
      className={`inline-flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-1.5 shadow-xl ${className}`}
      style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)' }}
    >
      {/* Previous month button */}
      <button
        type="button"
        onClick={handlePrevMonth}
        title="Previous Month"
        className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all text-sm font-bold active:scale-95 border border-slate-700/50"
      >
        ‹
      </button>

      {/* Month Dropdown */}
      <div className="relative">
        <select
          value={selectedMonth}
          onChange={(e) => onChange(selectedYear, parseInt(e.target.value, 10))}
          className="appearance-none bg-slate-800/80 hover:bg-slate-700/80 text-white font-bold text-xs sm:text-sm rounded-xl px-3 py-1.5 pr-7 border border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer transition-all"
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1} className="bg-slate-900 text-white">
              {name}
            </option>
          ))}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
          ▼
        </span>
      </div>

      {/* Year Dropdown */}
      <div className="relative">
        <select
          value={selectedYear}
          onChange={(e) => onChange(parseInt(e.target.value, 10), selectedMonth)}
          className="appearance-none bg-slate-800/80 hover:bg-slate-700/80 text-white font-bold text-xs sm:text-sm rounded-xl px-3 py-1.5 pr-7 border border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer transition-all"
        >
          {years.map((yr) => (
            <option key={yr} value={yr} className="bg-slate-900 text-white">
              {yr}
            </option>
          ))}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
          ▼
        </span>
      </div>

      {/* Next month button */}
      <button
        type="button"
        onClick={handleNextMonth}
        title="Next Month"
        className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all text-sm font-bold active:scale-95 border border-slate-700/50"
      >
        ›
      </button>

      {/* Current Month reset pill */}
      {!isCurrentMonth && (
        <button
          type="button"
          onClick={handleResetToCurrent}
          title="Reset to current month"
          className="text-xs px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 border border-blue-500/30 transition-all font-semibold whitespace-nowrap"
        >
          Today
        </button>
      )}
    </div>
  );
}
