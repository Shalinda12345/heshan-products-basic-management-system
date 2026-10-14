'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { logout } from '@/app/login/logout';
import { usePermissions } from '@/app/components/auth/user-provider';
import { MANAGE_TABS } from '@/app/components/admin/manage-navigation';
import type { Permission } from '@/app/lib/permissions';

// A main link is shown when the user has any of its permissions
const NAV_LINKS: { href: string; label: string; anyOf: Permission[] }[] = [
  { href: '/', label: 'Dashboard', anyOf: ['dashboard.view'] },
  { href: '/pages/sales', label: 'Sales', anyOf: ['sales.create', 'sales.view'] },
  { href: '/pages/expenses', label: 'Expenses', anyOf: ['expenses.create'] },
  { href: '/pages/stock', label: 'Stock', anyOf: ['stock.view'] },
  { href: '/reports', label: 'Reports', anyOf: ['reports.view'] },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user, can, roleLabel } = usePermissions();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  const links = NAV_LINKS.filter((link) => link.anyOf.some((p) => can(p)));
  const manageLinks = MANAGE_TABS.filter((tab) => !tab.permission || can(tab.permission));
  const manageActive = pathname.startsWith('/admin');

  // Close the Manage menu on a click elsewhere or Escape
  useEffect(() => {
    if (!manageOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!manageRef.current?.contains(e.target as Node)) setManageOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setManageOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [manageOpen]);

  if (!user) return null;

  const linkClass = (active: boolean) =>
    `rounded-xl border px-3.5 py-2 text-sm font-semibold transition duration-200 hover:border-sky-500/60 hover:bg-slate-900 hover:text-sky-300 ${active ? 'border-sky-500/60 bg-slate-900 text-sky-300' : 'border-transparent text-zinc-300'}`;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 py-2 shadow-lg shadow-zinc-900/10 backdrop-blur-xl" aria-label="Main">
      <div className="mx-auto flex w-full max-w-[96rem] min-h-[68px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center" aria-label="Home">
          <Image src="/logo/heshan_logo_transparent.png" alt="Heshan Products Logo" width={64} height={64} priority />
        </Link>

        {/* Desktop navigation */}
        <div className="hidden lg:flex flex-1 items-center gap-1.5">
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? 'page' : undefined} className={linkClass(isActive(link.href))}>
              {link.label}
            </Link>
          ))}

          {manageLinks.length > 0 && (
            <div className="relative" ref={manageRef}>
              <button
                type="button"
                onClick={() => setManageOpen((open) => !open)}
                aria-expanded={manageOpen}
                aria-haspopup="menu"
                className={`${linkClass(manageActive)} inline-flex items-center gap-1.5 cursor-pointer`}
              >
                Manage
                <svg className={`h-4 w-4 transition-transform ${manageOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {manageOpen && (
                <div role="menu" className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-700/70 bg-slate-900 p-1.5 shadow-2xl shadow-black/50">
                  {manageLinks.map((tab) => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      role="menuitem"
                      onClick={() => setManageOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${pathname.startsWith(tab.href) ? 'bg-violet-600/20 text-violet-200' : 'text-slate-200 hover:bg-slate-800'}`}
                    >
                      <span aria-hidden>{tab.icon}</span>
                      {tab.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Signed-in user */}
        <div className="hidden lg:flex items-center gap-2">
          <Link href="/account" className="flex items-center gap-3 rounded-xl px-2.5 py-1.5 hover:bg-slate-900" title="My account">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-xs font-black text-white" aria-hidden>
              {initials(user.name)}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-semibold text-slate-100">{user.name}</span>
              <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">{roleLabel}</span>
            </span>
          </Link>
          <form action={logout}>
            <button type="submit" className="rounded-xl border border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-rose-500/60 hover:bg-rose-950/40 hover:text-rose-200 cursor-pointer">
              Sign out
            </button>
          </form>
        </div>

        {/* Mobile menu button */}
        <div className="flex lg:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            aria-controls="mobile-menu"
            aria-expanded={isOpen}
          >
            <span className="sr-only">Open main menu</span>
            {isOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="lg:hidden border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-lg" id="mobile-menu">
          <div className="space-y-1.5 px-4 pt-4 pb-5 text-base font-medium text-zinc-300">
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-slate-900/80 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-xs font-black text-white" aria-hidden>{initials(user.name)}</span>
              <span className="leading-tight">
                <span className="block font-semibold text-slate-100">{user.name}</span>
                <span className="block text-xs uppercase tracking-wider text-slate-400">{roleLabel}</span>
              </span>
            </div>
            {[...links, ...manageLinks.map((tab) => ({ href: tab.href, label: tab.label }))].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`block rounded-2xl px-4 py-3 transition hover:bg-slate-800/90 hover:text-sky-300 ${isActive(link.href) ? 'bg-slate-800 text-sky-300' : 'bg-slate-900/80'}`}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/account" onClick={() => setIsOpen(false)} className="block rounded-2xl bg-slate-900/80 px-4 py-3 hover:bg-slate-800/90">My account</Link>
            <form action={logout}>
              <button type="submit" className="block w-full rounded-2xl bg-rose-700 px-4 py-3 text-left font-semibold text-white transition hover:bg-rose-800 cursor-pointer">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </nav>
  );
}
