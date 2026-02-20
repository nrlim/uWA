"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    Smartphone,
    Radio,
    History,
    Settings,
    LogOut,
    MessageCircle,
    FileText,
    Users,
    CreditCard
} from "lucide-react"

const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    { name: "Connection", icon: Smartphone, href: "/dashboard/connection" },
    { name: "Contacts", icon: Users, href: "/dashboard/contacts" },
    { name: "Broadcast", icon: Radio, href: "/dashboard/broadcast" },
    { name: "Templates", icon: FileText, href: "/dashboard/templates" },
    { name: "History", icon: History, href: "/dashboard/history" },
    { name: "Subscription", icon: CreditCard, href: "/dashboard/subscription" },
    { name: "Settings", icon: Settings, href: "/dashboard/settings" },
]

type UserProfile = {
    username: string;
    name: string | null;
    plan: string;
};

export function Sidebar({ userProfile }: { userProfile?: UserProfile | null }) {
    const pathname = usePathname()

    return (
        <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] text-slate-400 hidden md:flex flex-col border-r border-slate-800">
            {/* Brand */}
            <div className="h-16 flex items-center px-6 border-b border-slate-800/50">
                <div className="flex items-center justify-center -ml-3 -mr-2">
                    <Image src="/images/main-logo-v2.png" alt="uWA Logo" width={64} height={64} className="object-contain drop-shadow-md" />
                </div>
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
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-slate-800 uppercase">
                        {userProfile?.username ? userProfile.username.substring(0, 2) : "AD"}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-semibold text-slate-200 truncate capitalize">
                            {userProfile?.name || userProfile?.username || "Admin User"}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate capitalize">
                            {userProfile?.plan || "Premium Plan"}
                        </p>
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
