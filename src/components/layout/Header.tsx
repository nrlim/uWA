"use client"

import { useStatus } from "@/contexts/StatusContext"
import { Wifi, WifiOff, ChevronRight, Home } from "lucide-react"
import Link from "next/link"

export function Header() {
    const { instance, isLoading } = useStatus()

    return (
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40 flex items-center justify-between px-6 transition-all duration-300">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm text-slate-500">
                <Link href="/dashboard" className="hover:text-slate-900 transition-colors flex items-center gap-1">
                    <Home className="h-4 w-4" />
                </Link>
                <ChevronRight className="h-4 w-4 text-slate-300" />
                <span className="font-medium text-slate-900">Overview</span>
            </div>

            {/* Connection Status Indicator */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-300 ${isLoading
                ? "bg-slate-50 text-slate-500 border-slate-100"
                : instance?.status === "CONNECTED"
                    ? "bg-emerald-50/50 text-emerald-600 border-emerald-100 ring-1 ring-emerald-500/10"
                    : "bg-red-50/50 text-red-600 border-red-100 ring-1 ring-red-500/10"
                }`}>
                {isLoading ? (
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                ) : instance?.status === "CONNECTED" ? (
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                )}
                <span className="tracking-wide">
                    {isLoading ? "Memuat..." : instance?.status === "CONNECTED" ? "Terhubung" : "Terputus"}
                </span>
            </div>
        </header>
    )
}
