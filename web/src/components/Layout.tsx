'use client';

import { useState, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  HomeIcon,
  CubeIcon,
  ClipboardDocumentListIcon,
  DocumentChartBarIcon,
  UsersIcon,
  Cog6ToothIcon,
  ArrowDownTrayIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Assets', href: '/assets', icon: CubeIcon },
  { name: 'Inspections', href: '/inspections', icon: ClipboardDocumentListIcon },
  { name: 'Reports', href: '/reports', icon: DocumentChartBarIcon },
];

const adminNavigation = [
  { name: 'Users', href: '/users', icon: UsersIcon },
  { name: 'Import', href: '/import', icon: ArrowDownTrayIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  // Get user initials from display name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-48 bg-[#0a1628] transform transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-12 px-3 border-b border-white/10">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-6 h-6 bg-white rounded flex items-center justify-center">
                <span className="text-[#0a1628] font-bold text-xs">I</span>
              </div>
              <span className="text-white text-sm font-semibold">INFRATEC</span>
            </Link>
            <button
              className="lg:hidden ml-auto p-1 text-white/60 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname?.startsWith(item.href) ?? false;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}

            <div className="pt-3 mt-3 border-t border-white/10">
              <p className="px-2 mb-1 text-[9px] font-medium text-white/40 uppercase tracking-wider">
                Admin
              </p>
              {adminNavigation.map((item) => {
                const isActive = pathname?.startsWith(item.href) ?? false;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={clsx(
                      'flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User */}
          <div className="p-2 border-t border-white/10">
            <div className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5">
              <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                <span className="text-white text-[9px] font-bold">
                  {user ? getInitials(user.displayName) : '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-white truncate">
                  {user?.displayName || 'Guest'}
                </p>
                <p className="text-[9px] text-white/40">{user?.role || 'Unknown'}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1 text-white/40 hover:text-white"
                title="Sign out"
              >
                <ArrowRightOnRectangleIcon className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-48">
        {/* Header */}
        <header className="sticky top-0 z-30 h-10 bg-white border-b border-gray-200 flex items-center px-3">
          <button
            className="lg:hidden p-1 -ml-1 text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="w-4 h-4" />
          </button>
          <span className="ml-2 lg:ml-0 text-xs text-gray-600">Silvertown Tunnel</span>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
            Demo
          </span>
        </header>

        {/* Content */}
        <main className="p-3">{children}</main>
      </div>
    </div>
  );
}
