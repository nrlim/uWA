"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    Smartphone,
    Radio,
    History,
    Settings,
    LogOut,
    MessageCircle,
    FileText
} from "lucide-react"

const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    { name: "Connection", icon: Smartphone, href: "/dashboard/connection" },
    { name: "Broadcast", icon: Radio, href: "/dashboard/broadcast" },
    { name: "Templates", icon: FileText, href: "/dashboard/templates" },
    { name: "History", icon: History, href: "/dashboard/history" },
    { name: "Settings", icon: Settings, href: "/dashboard/settings" },
]

export function Sidebar() {
    const pathname = usePathname()

    return (
        <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] text-slate-400 hidden md:flex flex-col border-r border-slate-800">
            {/* Brand */}
            <div className="h-16 flex items-center px-6 border-b border-slate-800/50 gap-3">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <MessageCircle className="h-5 w-5 fill-current" />
                </div>
                <span className="font-semibold text-lg tracking-tight text-white/90">uWA Engine</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-6 space-y-1">
                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-3">Menu Utama</div>
                {menuItems.map((item) => {
                    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard');
                    // Special case for dashboard root to strictly match or handle sub-routes if desired
                    const isExactActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isExactActive
                                ? "bg-slate-800 text-white"
                                : "hover:bg-slate-800/50 hover:text-white"
                                }`}
                        >
                            <item.icon className={`h-4 w-4 transition-colors ${isExactActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                            <span>{item.name}</span>
                        </Link>
                    )
                })}
            </nav>

            {/* User Profile / Footer */}
            <div className="p-4 border-t border-slate-800/50">
                <div className="flex items-center gap-3 px-2 py-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-slate-800">
                        AD
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-semibold text-slate-200 truncate">Admin User</p>
                        <p className="text-[10px] text-slate-500 truncate">Premium Plan</p>
                    </div>
                    <button
                        onClick={async () => {
                            try {
                                await fetch('/api/auth/logout', { method: 'POST' });
                                window.location.href = '/';
                            } catch (e) {
                                console.error('Logout failed', e);
                            }
                        }}
                        className="text-slate-500 hover:text-white transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    )
}
