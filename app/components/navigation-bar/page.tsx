'use client';

import { useState } from 'react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/85 py-2 shadow-lg shadow-zinc-900/5 backdrop-blur-xl transition duration-300 dark:border-slate-800/80 dark:bg-slate-950/85">
      <div className="mx-auto flex w-full max-w-[96rem] min-h-[80px] items-center justify-between gap-6 px-6 sm:px-8 lg:px-12">
        
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20">
            <span className="text-lg font-bold">B</span>
          </div>
          <div>
            <a href="/" className="text-2xl font-semibold tracking-tight text-zinc-900 transition hover:text-sky-600 dark:text-white dark:hover:text-sky-400">Basic Manager</a>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Dashboard</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 text-lg font-semibold text-zinc-600 dark:text-zinc-300">
          <a href="/" className="rounded-3xl border border-transparent bg-zinc-100/80 px-5 py-3 transition duration-300 ease-out hover:border-sky-300 hover:bg-white hover:text-sky-700 dark:bg-slate-900/70 dark:hover:border-sky-500 dark:hover:bg-slate-900 dark:hover:text-sky-300">Home</a>
          <a href="/pages/sales" className="rounded-3xl border border-transparent bg-zinc-100/80 px-5 py-3 transition duration-300 ease-out hover:border-sky-300 hover:bg-white hover:text-sky-700 dark:bg-slate-900/70 dark:hover:border-sky-500 dark:hover:bg-slate-900 dark:hover:text-sky-300">Sales</a>
          <a href="/pages/expenses" className="rounded-3xl border border-transparent bg-zinc-100/80 px-5 py-3 transition duration-300 ease-out hover:border-sky-300 hover:bg-white hover:text-sky-700 dark:bg-slate-900/70 dark:hover:border-sky-500 dark:hover:bg-slate-900 dark:hover:text-sky-300">Expenses</a>
          <a href="/pages/stock" className="rounded-3xl border border-transparent bg-zinc-100/80 px-5 py-3 transition duration-300 ease-out hover:border-sky-300 hover:bg-white hover:text-sky-700 dark:bg-slate-900/70 dark:hover:border-sky-50₀ dark:hover:bg-slate-9₀₀ dark:hover:text-sky-3₀₀">Stock</a>
        </div>

        {/* 2. MOBILE HAMBURGER BUTTON: Scale up the button and icon slightly */}
        <div className="flex md:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            type="button"
            className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-700 shadow-sm shadow-slate-900/10 transition duration-300 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-controls="mobile-menu"
            aria-expanded={isOpen}
          >
            <span className="sr-only">Open main menu</span>
            {isOpen ? (
              // X Icon bumped to h-7 w-7
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              // Hamburger Icon bumped to h-7 w-7
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 3. MOBILE DROPDOWN MENU: Bumped font from text-base to text-lg for easier thumb-tapping */}
      {isOpen && (
        <div className="md:hidden border-t border-zinc-200/80 bg-white/95 backdrop-blur-lg dark:border-slate-800/80 dark:bg-slate-950/95" id="mobile-menu">
          <div className="space-y-2 px-4 pt-4 pb-5 font-sans text-lg font-medium text-zinc-600 dark:text-zinc-300">
            <a href="/" className="block rounded-3xl bg-zinc-100/90 px-4 py-3 transition duration-300 hover:bg-zinc-200/80 hover:text-sky-700 dark:bg-slate-900/80 dark:hover:bg-slate-800/90 dark:hover:text-sky-300">Home</a>
            <a href="/pages/sales" className="block rounded-3xl bg-zinc-100/90 px-4 py-3 transition duration-300 hover:bg-zinc-200/80 hover:text-sky-700 dark:bg-slate-900/80 dark:hover:bg-slate-800/90 dark:hover:text-sky-300">Sales</a>
            <a href="/pages/expenses" className="block rounded-3xl bg-zinc-100/90 px-4 py-3 transition duration-300 hover:bg-zinc-200/80 hover:text-sky-700 dark:bg-slate-900/80 dark:hover:bg-slate-800/90 dark:hover:text-sky-300">Expenses</a>
            <a href="/pages/stock" className="block rounded-3xl bg-zinc-100/90 px-4 py-3 transition duration-300 hover:bg-zinc-200/80 hover:text-sky-700 dark:bg-slate-900/80 dark:hover:bg-slate-800/90 dark:hover:text-sky-300">Stock</a>
          </div>
        </div>
      )}
    </nav>
  );
}