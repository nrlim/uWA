"use client"

import { useState, useCallback } from "react"
import { useStatus } from "@/contexts/StatusContext"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
    MoreHorizontal,
    Calendar,
    BarChart3,
    FileBox,
    Eye,
    Trash2,
    Shield,
    ChevronLeft,
    ChevronRight,
    Activity,
    Filter,
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// ── Log Action Badge Colors ────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
    'TRUST_TIER': 'bg-violet-50 text-violet-700 border-violet-200',
    'WARMUP_BLOCK': 'bg-red-50 text-red-700 border-red-200',
    'LINK_WARNING': 'bg-orange-50 text-orange-700 border-orange-200',
    'LINK_DETECTED': 'bg-amber-50 text-amber-700 border-amber-200',
    'CIRCUIT_BREAKER': 'bg-red-50 text-red-700 border-red-200',
    'RATE_LIMIT_PAUSE': 'bg-red-50 text-red-700 border-red-200',
    'SKIP_INVALID': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'SESSION_VALIDATE': 'bg-blue-50 text-blue-700 border-blue-200',
    'TYPING': 'bg-sky-50 text-sky-700 border-sky-200',
    'COOLDOWN': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'SPINTAX': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'UNIQUE_SUFFIX': 'bg-purple-50 text-purple-700 border-purple-200',
    'CREDIT_EXHAUSTED': 'bg-red-50 text-red-700 border-red-200',
    'WORKING_HOURS_PAUSE': 'bg-slate-50 text-slate-700 border-slate-200',
    'STEALTH_OFFLINE': 'bg-teal-50 text-teal-700 border-teal-200',
    'STEALTH_READ': 'bg-teal-50 text-teal-700 border-teal-200',
    'STEALTH_BROWSE': 'bg-teal-50 text-teal-700 border-teal-200',
    'STEALTH_DISCARD': 'bg-teal-50 text-teal-700 border-teal-200',
}

const ACTION_ICONS: Record<string, string> = {
    'TRUST_TIER': '🎯',
    'WARMUP_BLOCK': '🛑',
    'LINK_WARNING': '⚠️',
    'LINK_DETECTED': 'ℹ️',
    'CIRCUIT_BREAKER': '🔌',
    'RATE_LIMIT_PAUSE': '🚫',
    'SKIP_INVALID': '⛔',
    'SESSION_VALIDATE': '🔐',
    'TYPING': '⌨️',
    'COOLDOWN': '🧊',
    'SPINTAX': '🔀',
    'UNIQUE_SUFFIX': '🔑',
    'CREDIT_EXHAUSTED': '💳',
    'WORKING_HOURS_PAUSE': '🌙',
    'STEALTH_OFFLINE': '🫥',
    'STEALTH_READ': '📖',
    'STEALTH_BROWSE': '👀',
    'STEALTH_DISCARD': '✍️',
}

// All possible action types for the filter
const ALL_ACTIONS = [
    'TRUST_TIER', 'WARMUP_BLOCK', 'LINK_WARNING', 'LINK_DETECTED',
    'SESSION_VALIDATE', 'TYPING', 'COOLDOWN', 'SPINTAX', 'UNIQUE_SUFFIX',
    'SKIP_INVALID', 'CIRCUIT_BREAKER', 'RATE_LIMIT_PAUSE',
    'CREDIT_EXHAUSTED', 'WORKING_HOURS_PAUSE',
    'STEALTH_OFFLINE', 'STEALTH_READ', 'STEALTH_BROWSE', 'STEALTH_DISCARD',
]

interface PaginationInfo {
    page: number
    limit: number
    totalCount: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
}

export default function HistoryPage() {
    const { recentBroadcasts, isLoading, refresh } = useStatus()

    // States for detail modal
    const [selectedBroadcast, setSelectedBroadcast] = useState<any>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [activeTab, setActiveTab] = useState("messages")

    // Messages state
    const [messages, setMessages] = useState<any[]>([])
    const [loadingMessages, setLoadingMessages] = useState(false)

    // Logs state with pagination
    const [logs, setLogs] = useState<any[]>([])
    const [loadingLogs, setLoadingLogs] = useState(false)
    const [logPagination, setLogPagination] = useState<PaginationInfo>({
        page: 1, limit: 20, totalCount: 0, totalPages: 0, hasNext: false, hasPrev: false
    })
    const [logActionFilter, setLogActionFilter] = useState("")

    const fetchLogs = useCallback(async (broadcastId: string, page: number = 1, action: string = "") => {
        setLoadingLogs(true)
        try {
            const params = new URLSearchParams({ page: String(page), limit: '20' })
            if (action) params.set('action', action)
            const res = await fetch(`/api/broadcast/${broadcastId}/logs?${params}`)
            const data = await res.json()
            if (data.logs) setLogs(data.logs)
            if (data.pagination) setLogPagination(data.pagination)
        } catch (error) {
            console.error(error)
        } finally {
            setLoadingLogs(false)
        }
    }, [])

    const handleOpenDetail = async (broadcast: any) => {
        setSelectedBroadcast(broadcast)
        setIsDetailOpen(true)
        setActiveTab("messages")
        setLogs([])
        setLogActionFilter("")
        setLogPagination({ page: 1, limit: 20, totalCount: 0, totalPages: 0, hasNext: false, hasPrev: false })

        // Fetch Messages
        setLoadingMessages(true)
        try {
            const res = await fetch(`/api/broadcast/${broadcast.id}/messages`)
            const data = await res.json()
            if (data.messages) setMessages(data.messages)
        } catch (error) {
            console.error(error)
        } finally {
            setLoadingMessages(false)
        }
    }

    const handleTabChange = (tab: string) => {
        setActiveTab(tab)
        if (tab === "logs" && selectedBroadcast && logs.length === 0) {
            fetchLogs(selectedBroadcast.id, 1, logActionFilter)
        }
    }

    const handleLogPageChange = (newPage: number) => {
        if (selectedBroadcast) {
            fetchLogs(selectedBroadcast.id, newPage, logActionFilter)
        }
    }

    const handleLogFilterChange = (action: string) => {
        setLogActionFilter(action)
        if (selectedBroadcast) {
            fetchLogs(selectedBroadcast.id, 1, action)
        }
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm("Apakah Anda yakin ingin menghapus riwayat kampanye ini? Data yang dihapus tidak dapat dikembalikan.")) {
            return
        }

        try {
            const res = await fetch(`/api/broadcast/${id}`, { method: 'DELETE' })
            if (res.ok) {
                refresh()
            } else {
                alert("Gagal menghapus kampanye.")
            }
        } catch (error) {
            console.error(error)
            alert("Error saat menghapus kampanye.")
        }
    }

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
                                                    <span className="font-semibold text-slate-900 text-sm group-hover:text-blue-600 transition-colors cursor-pointer" onClick={() => handleOpenDetail(b)}>{b.name}</span>
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
                                                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenDetail(b)}>
                                                            <Eye className="mr-2 h-4 w-4" /> Detail
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => handleDelete(b.id)}>
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

                {/* Pagination Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Menampilkan {recentBroadcasts.length} dari {recentBroadcasts.length} data</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-slate-200 text-slate-600" disabled>Sebelumnya</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-slate-200 text-slate-600" disabled>Selanjutnya</Button>
                    </div>
                </div>
            </div>

            {/* ── Detail Dialog with Tabs ─────────────────────────────── */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none bg-slate-50 shadow-2xl">
                    <div className="p-6 bg-white border-b border-slate-100 shrink-0">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-1">
                                <DialogTitle className="text-xl font-bold text-slate-900">
                                    {selectedBroadcast?.name}
                                </DialogTitle>
                                <Badge variant="secondary" className="rounded-full text-[10px] bg-slate-100 text-slate-600 border-none">
                                    {selectedBroadcast?.status}
                                </Badge>
                            </div>
                            <DialogDescription className="text-slate-500 font-medium text-sm">
                                ID: {selectedBroadcast?.id} • Dibuat pada {selectedBroadcast && new Date(selectedBroadcast.createdAt).toLocaleString('id-ID')}
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="flex-1 overflow-hidden p-6 flex flex-col">
                        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 overflow-hidden">
                            <TabsList className="grid w-full grid-cols-2 bg-slate-100/80 rounded-lg p-1 shrink-0">
                                <TabsTrigger
                                    value="messages"
                                    className="text-xs font-semibold rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                                >
                                    <Eye className="h-3.5 w-3.5 mr-2" />
                                    Detail Pesan ({messages.length})
                                </TabsTrigger>
                                <TabsTrigger
                                    value="logs"
                                    className="text-xs font-semibold rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                                >
                                    <Shield className="h-3.5 w-3.5 mr-2" />
                                    Anti-Ban Log {logPagination.totalCount > 0 ? `(${logPagination.totalCount})` : ''}
                                </TabsTrigger>
                            </TabsList>

                            {/* ── Messages Tab ──────────────────────────── */}
                            <TabsContent value="messages" className="flex-1 overflow-hidden mt-4">
                                {loadingMessages ? (
                                    <div className="flex flex-col items-center justify-center p-20 gap-3">
                                        <div className="h-8 w-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                                        <p className="text-slate-500 text-xs font-medium">Memuat data pesan...</p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
                                        <div className="overflow-y-auto flex-1">
                                            <table className="w-full text-left text-sm border-collapse">
                                                <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                                                    <tr>
                                                        <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[25%]">Penerima</th>
                                                        <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider text-center w-[15%]">Status</th>
                                                        <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[20%]">Waktu</th>
                                                        <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[40%]">Keterangan</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {messages.map((msg, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-medium text-slate-900">{msg.recipient}</td>
                                                            <td className="px-6 py-4 text-center">
                                                                <Badge
                                                                    variant="secondary"
                                                                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border shadow-none ${msg.status === 'SENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                        msg.status === 'FAILED' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                            'bg-slate-50 text-slate-600 border-slate-200'
                                                                        }`}
                                                                >
                                                                    {msg.status}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-500 text-xs">
                                                                {msg.sentAt ? new Date(msg.sentAt).toLocaleString('id-ID') : '-'}
                                                            </td>
                                                            <td className="px-6 py-4 text-slate-500 text-xs break-words font-medium">
                                                                {msg.error || (msg.status === 'SENT' ? '✓ Pesan berhasil dikirim' : '-')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {messages.length === 0 && (
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-20 text-center">
                                                                <p className="text-slate-400 text-sm">Tidak ada detail pesan.</p>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </TabsContent>

                            {/* ── Anti-Ban Logs Tab ──────────────────────── */}
                            <TabsContent value="logs" className="flex-1 overflow-hidden mt-4 flex flex-col gap-3">
                                {/* Filter Bar */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                        <Filter className="h-3.5 w-3.5" />
                                        <span>Filter:</span>
                                    </div>
                                    <Button
                                        variant={logActionFilter === "" ? "default" : "outline"}
                                        size="sm"
                                        className="h-7 text-[10px] font-semibold rounded-full px-3"
                                        onClick={() => handleLogFilterChange("")}
                                    >
                                        Semua
                                    </Button>
                                    {['TRUST_TIER', 'COOLDOWN', 'CIRCUIT_BREAKER', 'RATE_LIMIT_PAUSE', 'SKIP_INVALID', 'LINK_WARNING', 'WARMUP_BLOCK'].map((action) => (
                                        <Button
                                            key={action}
                                            variant={logActionFilter === action ? "default" : "outline"}
                                            size="sm"
                                            className="h-7 text-[10px] font-semibold rounded-full px-3"
                                            onClick={() => handleLogFilterChange(action)}
                                        >
                                            {ACTION_ICONS[action] || '📋'} {action.replace(/_/g, ' ')}
                                        </Button>
                                    ))}
                                </div>

                                {loadingLogs ? (
                                    <div className="flex flex-col items-center justify-center p-16 gap-3">
                                        <div className="h-8 w-8 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin"></div>
                                        <p className="text-slate-500 text-xs font-medium">Memuat anti-ban log...</p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
                                        <div className="overflow-y-auto flex-1">
                                            <table className="w-full text-left text-sm border-collapse">
                                                <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                                                    <tr>
                                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[18%]">Waktu</th>
                                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[20%]">Aksi</th>
                                                        <th className="px-5 py-3.5 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[62%]">Detail</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {logs.map((log) => {
                                                        const colorClass = ACTION_COLORS[log.action] || 'bg-slate-50 text-slate-600 border-slate-200'
                                                        const icon = ACTION_ICONS[log.action] || '📋'

                                                        return (
                                                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                                                                <td className="px-5 py-3 align-top">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span className="text-slate-700 text-xs font-medium">
                                                                            {new Date(log.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                        </span>
                                                                        <span className="text-slate-400 text-[10px]">
                                                                            {new Date(log.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-5 py-3 align-top">
                                                                    <Badge
                                                                        variant="secondary"
                                                                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border shadow-none ${colorClass}`}
                                                                    >
                                                                        {icon} {log.action}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-5 py-3 align-top">
                                                                    <p className="text-slate-600 text-xs leading-relaxed font-medium break-words">
                                                                        {log.detail || '-'}
                                                                    </p>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                    {logs.length === 0 && (
                                                        <tr>
                                                            <td colSpan={3} className="px-6 py-16 text-center">
                                                                <div className="flex flex-col items-center gap-3">
                                                                    <div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                                                        <Activity className="h-5 w-5 text-slate-400" />
                                                                    </div>
                                                                    <p className="text-slate-400 text-sm font-medium">
                                                                        {logActionFilter ? `Tidak ada log dengan filter "${logActionFilter}"` : 'Belum ada anti-ban log.'}
                                                                    </p>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Pagination Footer */}
                                        {logPagination.totalPages > 0 && (
                                            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between shrink-0">
                                                <span className="text-[11px] text-slate-500 font-medium">
                                                    Hal. {logPagination.page} dari {logPagination.totalPages} • {logPagination.totalCount} total log
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 bg-white border-slate-200 text-slate-600"
                                                        disabled={!logPagination.hasPrev}
                                                        onClick={() => handleLogPageChange(logPagination.page - 1)}
                                                    >
                                                        <ChevronLeft className="h-3.5 w-3.5" />
                                                    </Button>

                                                    {/* Page Numbers */}
                                                    {Array.from({ length: Math.min(5, logPagination.totalPages) }, (_, i) => {
                                                        let pageNum: number
                                                        if (logPagination.totalPages <= 5) {
                                                            pageNum = i + 1
                                                        } else if (logPagination.page <= 3) {
                                                            pageNum = i + 1
                                                        } else if (logPagination.page >= logPagination.totalPages - 2) {
                                                            pageNum = logPagination.totalPages - 4 + i
                                                        } else {
                                                            pageNum = logPagination.page - 2 + i
                                                        }
                                                        return (
                                                            <Button
                                                                key={pageNum}
                                                                variant={pageNum === logPagination.page ? "default" : "outline"}
                                                                size="sm"
                                                                className={`h-7 w-7 p-0 text-[11px] font-semibold ${pageNum === logPagination.page
                                                                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                                                                    : 'bg-white border-slate-200 text-slate-600'
                                                                    }`}
                                                                onClick={() => handleLogPageChange(pageNum)}
                                                            >
                                                                {pageNum}
                                                            </Button>
                                                        )
                                                    })}

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 bg-white border-slate-200 text-slate-600"
                                                        disabled={!logPagination.hasNext}
                                                        onClick={() => handleLogPageChange(logPagination.page + 1)}
                                                    >
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
