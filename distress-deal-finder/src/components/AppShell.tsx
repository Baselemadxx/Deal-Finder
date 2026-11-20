'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flame, LayoutDashboard, ListFilter, MessageSquare, ShieldCheck } from 'lucide-react';
import { ChatDrawer } from './ChatDrawer';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/top-10', label: 'Top 10', icon: Flame },
  { href: '/leads', label: 'All Leads', icon: ListFilter },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen pb-20 md:pb-8">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight text-slate-900">Distress Deal Finder</div>
              <div className="text-[11px] font-medium text-slate-500">Metro Atlanta &bull; Autonomous Public Records</div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => setChatOpen(true)}
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700"
            >
              <MessageSquare className="h-4 w-4" />
              Ask AI
            </button>
          </nav>

          {/* Mobile quick AI button in header */}
          <button
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white md:hidden"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask AI
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-medium ${
                  active ? 'text-slate-900 font-bold' : 'text-slate-500'
                }`}
              >
                <Icon className={`mb-0.5 h-5 w-5 ${active ? 'text-slate-900' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setChatOpen(true)}
            className="flex flex-col items-center justify-center py-2.5 text-[11px] font-medium text-blue-600"
          >
            <MessageSquare className="mb-0.5 h-5 w-5" />
            AI Chat
          </button>
        </div>
      </nav>

      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
