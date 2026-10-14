'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';
import { logout } from '@/app/login/logout';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/pages/sales', label: 'Sales' },
  { href: '/pages/expenses', label: 'Expenses' },
  { href: '/pages/stock', label: 'Stock' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 py-2 shadow-lg shadow-zinc-900/10 backdrop-blur-xl transition duration-300">
      <div className="mx-auto flex w-full max-w-[96rem] min-h-[80px] items-center justify-between gap-6 px-6 sm:px-8 lg:px-12">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image
              src="/logo/heshan_logo_transparent.png"
              alt="Heshan Products Logo"
              width={75}
              height={75}
              priority
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-4 text-lg font-semibold text-zinc-300">

          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`rounded-3xl border px-5 py-3 transition duration-300 ease-out hover:border-sky-500 hover:bg-slate-900 hover:text-sky-300 ${isActive(link.href) ? 'border-sky-500/60 bg-slate-900 text-sky-300' : 'border-transparent bg-slate-900/70'}`}
            >
              {link.label}
            </Link>
          ))}

          {/* Logout */}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-3xl bg-red-600 px-5 py-3 font-semibold text-white transition duration-300 hover:bg-red-700 cursor-pointer"
            >
              Logout
            </button>
          </form>

        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            type="button"
            className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-900 text-slate-200 shadow-sm shadow-slate-950/10 transition duration-300 hover:bg-slate-800"
            aria-controls="mobile-menu"
            aria-expanded={isOpen}
          >
            <span className="sr-only">Open main menu</span>

            {isOpen ? (
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div
          className="md:hidden border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-lg"
          id="mobile-menu"
        >
          <div className="space-y-2 px-4 pt-4 pb-5 font-sans text-lg font-medium text-zinc-300">

            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`block rounded-3xl px-4 py-3 transition duration-300 hover:bg-slate-800/90 hover:text-sky-300 ${isActive(link.href) ? 'bg-slate-800 text-sky-300' : 'bg-slate-900/80'}`}
              >
                {link.label}
              </Link>
            ))}

            {/* Mobile Logout */}
            <form action={logout}>
              <button
                type="submit"
                className="block w-full rounded-3xl bg-red-600 px-4 py-3 text-left font-semibold text-white transition duration-300 hover:bg-red-700 cursor-pointer"
              >
                Logout
              </button>
            </form>

          </div>
        </div>
      )}
    </nav>
  );
}