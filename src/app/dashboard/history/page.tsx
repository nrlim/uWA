"use client"

import { useStatus } from "@/contexts/StatusContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
    CheckCircle2,
    AlertCircle,
    Clock,
    ChevronRight,
    XCircle,
    MoreHorizontal,
    Calendar,
    BarChart3,
    FileBox,
    Eye,
    Trash2
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function HistoryPage() {
    const { recentBroadcasts, isLoading } = useStatus()

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-8 w-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                <p className="text-slate-500 text-sm font-medium animate-pulse">Memuat riwayat...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Riwayat Pesan</h1>
                    <p className="text-slate-500 text-sm mt-1">Log lengkap semua kampanye pesan broadcast Anda.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-9 text-xs font-medium border-slate-200 text-slate-600">
                        <Calendar className="h-3.5 w-3.5 mr-2" /> Filter Tanggal
                    </Button>
                    <Button variant="outline" className="h-9 text-xs font-medium border-slate-200 text-slate-600">
                        <BarChart3 className="h-3.5 w-3.5 mr-2" /> Export CSV
                    </Button>
                </div>
            </div>

            {/* Main Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[30%]">Kampanye</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[20%]">Waktu</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[25%]">Statistik Pengiriman</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider text-center w-[15%]">Status</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider text-right w-[10%]">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {recentBroadcasts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                                <FileBox className="h-6 w-6 text-slate-400" />
                                            </div>
                                            <p className="text-slate-900 font-medium">Belum ada riwayat</p>
                                            <p className="text-slate-400 text-xs">Mulai kampanye pertama Anda untuk melihat data di sini.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                recentBroadcasts.map((b) => {
                                    const percentage = b.total > 0 ? Math.round((b.sent / b.total) * 100) : 0;

                                    return (
                                        <tr key={b.id} className="group hover:bg-slate-50/50 transition-colors">
                                            {/* Campaign Name & ID */}
                                            <td className="px-6 py-4 align-top">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-semibold text-slate-900 text-sm group-hover:text-blue-600 transition-colors cursor-pointer">{b.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono">ID: {b.id.substring(0, 8)}...</span>
                                                </div>
                                                {b.status === 'RUNNING' && (
                                                    <div className="mt-3 max-w-[140px]">
                                                        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                                                            <span>Mengirim...</span>
                                                            <span>{percentage}%</span>
                                                        </div>
                                                        <Progress value={percentage} className="h-1 bg-slate-100" />
                                                    </div>
                                                )}
                                            </td>

                                            {/* Date */}
                                            <td className="px-6 py-4 align-top">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-slate-700 text-sm font-medium">
                                                        {new Date(b.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </span>
                                                    <span className="text-slate-400 text-xs">
                                                        {new Date(b.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Stats */}
                                            <td className="px-6 py-4 align-top">
                                                <div className="flex items-center gap-6">
                                                    <div>
                                                        <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Total</div>
                                                        <div className="text-sm font-bold text-slate-900">{b.total}</div>
                                                    </div>
                                                    <div className="w-px h-8 bg-slate-100"></div>
                                                    <div>
                                                        <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Sukses</div>
                                                        <div className="text-sm font-bold text-emerald-600">{b.sent}</div>
                                                    </div>
                                                    <div className="w-px h-8 bg-slate-100"></div>
                                                    <div>
                                                        <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Gagal</div>
                                                        <div className="text-sm font-bold text-red-600">{b.failed}</div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-6 py-4 align-top text-center">
                                                <Badge
                                                    variant="secondary"
                                                    className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border shadow-none ${b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        b.status === 'FAILED' ? 'bg-red-50 text-red-700 border-red-200' :
                                                            b.status === 'RUNNING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                'bg-slate-50 text-slate-600 border-slate-200'
                                                        }`}
                                                >
                                                    {b.status}
                                                </Badge>
                                            </td>

                                            {/* Action */}
                                            <td className="px-6 py-4 align-top text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[160px]">
                                                        <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="cursor-pointer">
                                                            <Eye className="mr-2 h-4 w-4" /> Detail
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                                                            <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer (Static for now) */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Menampilkan {recentBroadcasts.length} dari {recentBroadcasts.length} data</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-slate-200 text-slate-600" disabled>Sebelumnya</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-slate-200 text-slate-600" disabled>Selanjutnya</Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
