"use client"

import { useStatus } from "@/contexts/StatusContext"
import { Button } from "@/components/ui/button"
import { ArrowRight, CheckCircle2, Zap, MoreHorizontal, Activity, Layers, Send, AlertCircle } from "lucide-react"
import Link from "next/link"

// Helper for sleek numbers
function formatNumber(num: number) {
  return new Intl.NumberFormat('id-ID').format(num)
}

function Sparkline() {
  return (
    <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
      <path d="M0 35 L10 32 L20 34 L30 28 L40 30 L50 20 L60 22 L70 15 L80 18 L90 10 L100 12"
        fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d="M0 35 L10 32 L20 34 L30 28 L40 30 L50 20 L60 22 L70 15 L80 18 L90 10 L100 12 V 40 H 0 Z"
        fill="currentColor" fillOpacity="0.1" stroke="none" />
    </svg>
  )
}

function CircularProgress({ value }: { value: number }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative h-12 w-12 flex items-center justify-center">
      <svg className="h-full w-full transform -rotate-90">
        <circle cx="24" cy="24" r={radius} stroke="currentColor" strokeWidth="3" fill="none" className="text-slate-100" />
        <circle cx="24" cy="24" r={radius} stroke="currentColor" strokeWidth="3" fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="text-emerald-500 transition-all duration-1000 ease-out" />
      </svg>
      {/* <span className="absolute text-[10px] font-bold text-slate-700">{Math.round(value)}%</span> */}
    </div>
  )
}

export default function DashboardPage() {
  const { instance, activeBroadcast, recentBroadcasts, isLoading, totalQueueCount } = useStatus()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium animate-pulse">Memuat dashboard...</p>
        </div>
      </div>
    )
  }

  const totalSent = recentBroadcasts.reduce((acc, curr) => acc + curr.sent, 0) + (activeBroadcast?.sent || 0)
  const successRate = totalSent > 0 ? 98.5 : 0
  const isActive = instance?.status === "CONNECTED"
  const queueCount = totalQueueCount

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ringkasan Performa</h1>
          <p className="text-slate-500 text-sm mt-1">Pantau metrik utama sistem Anda hari ini.</p>
        </div>
        <Link href="/dashboard/broadcast">
          <Button className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-5 h-10 rounded-lg shadow-sm hover:shadow transition-all">
            Buat Kampanye
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Status */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Engine Status</span>
            <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500'}`} />
          </div>
          <div className="space-y-1">
            <span className={`text-2xl font-bold tracking-tight ${isActive ? 'text-slate-900' : 'text-slate-900'}`}>
              {isActive ? "Online" : "Offline"}
            </span>
            <p className="text-sm text-slate-500">
              {isActive ? "Sistem siap digunakan." : "Koneksi terputus."}
            </p>
          </div>
        </div>

        {/* Card 2: Volume */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute inset-x-0 bottom-0 h-16 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <Sparkline />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pesan Terkirim</span>
              <Send className="h-4 w-4 text-slate-300" />
            </div>
            <div className="space-y-1">
              <span className="text-2xl font-bold tracking-tight text-slate-900">{formatNumber(totalSent)}</span>
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
                <Activity className="h-3 w-3" />
                <span>+12.5%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Quality */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-4">Tingkat Keberhasilan</span>
            <span className="text-2xl font-bold tracking-tight text-slate-900">{successRate}%</span>
            <p className="text-sm text-slate-500 mt-1">Rata-rata pengiriman</p>
          </div>
          <div className="text-emerald-500">
            <CircularProgress value={successRate} />
          </div>
        </div>

        {/* Card 4: Queue */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Antrean Saat Ini</span>
            <Layers className="h-4 w-4 text-slate-300" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{formatNumber(queueCount)}</span>
            {queueCount > 0 && (
              <span className="h-2 w-2 rounded-full bg-amber-500 mb-2 animate-bounce" />
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {queueCount === 0 ? "Tidak ada antrean." : "Pesan menunggu."}
          </p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Aktivitas Terkini</h2>
          <Link href="/dashboard/history" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
            Lihat Semua
          </Link>
        </div>

        {recentBroadcasts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="h-24 w-24 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Zap className="h-10 w-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">Belum ada aktivitas</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">Mulai kampanye broadcast pertama Anda untuk melihat analitik di sini.</p>
            <Link href="/dashboard/broadcast">
              <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg">
                Buat Kampanye Pertama Anda
              </Button>
            </Link>
          </div>
        ) : (
          <div>
            {recentBroadcasts.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 border ${b.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                    b.status === 'FAILED' ? 'bg-red-50 border-red-100 text-red-600' :
                      b.status === 'PAUSED_NO_CREDIT' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                        'bg-blue-50 border-blue-100 text-blue-600'
                    }`}>
                    {b.status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5" /> :
                      b.status === 'FAILED' ? <AlertCircle className="h-5 w-5" /> :
                        b.status === 'PAUSED_NO_CREDIT' ? <AlertCircle className="h-5 w-5" /> :
                          <Zap className="h-5 w-5" />}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900">{b.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>{new Date(b.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span>&bull;</span>
                      <span>{b.total} penerima</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <span className="block text-xs font-semibold text-slate-900">{b.sent}</span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Terkirim</span>
                  </div>

                  <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    b.status === 'FAILED' ? 'bg-red-50 text-red-600 border-red-100' :
                      b.status === 'PAUSED_NO_CREDIT' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                    {b.status === 'PAUSED_NO_CREDIT' ? 'JEDA (KREDIT HABIS)' : b.status}
                  </div>

                  <button className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
