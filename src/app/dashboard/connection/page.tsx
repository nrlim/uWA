"use client"

import { useState } from "react"
import { useStatus } from "@/contexts/StatusContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { QRCodeSVG } from "qrcode.react"
import {
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    ShieldCheck,
    HelpCircle,
    Smartphone,
    LogOut,
    QrCode,
    Lock
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ConnectionPage() {
    const { instance, isLoading, refresh } = useStatus()
    const [isDisconnecting, setIsDisconnecting] = useState(false)

    const handleDisconnect = async () => {
        if (!confirm('Apakah Anda yakin ingin memutuskan koneksi WhatsApp? Anda harus scan QR ulang untuk menghubungkan kembali.')) return

        setIsDisconnecting(true)
        try {
            const res = await fetch('/api/disconnect', { method: 'POST' })
            if (res.ok) {
                // Polling will pick up the status change automatically
                setTimeout(refresh, 1000)
            }
        } catch (err) {
            console.error('Disconnect failed:', err)
        } finally {
            setIsDisconnecting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="h-10 w-10 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm font-medium animate-pulse">Menghubungkan ke gateway aman...</p>
            </div>
        )
    }

    const isConnected = instance?.status === "CONNECTED"
    const hasQR = instance?.qrCode && instance.status === "QR_READY"

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manajemen Koneksi</h1>
                    <p className="text-slate-500 text-sm mt-1">Kelola dan pantau hubungan antara uWA dan WhatsApp Anda.</p>
                </div>
                <Button
                    variant="outline"
                    onClick={refresh}
                    className="gap-2 h-10 px-4 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 rounded-lg shadow-sm transition-all"
                >
                    <RefreshCw className="h-4 w-4" />
                    <span className="text-sm font-medium">Segarkan Gateway</span>
                </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Main Connection Area */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden rounded-xl">
                        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                    <Smartphone className="h-4 w-4 text-slate-500" />
                                    Status Perangkat
                                </CardTitle>
                                {isConnected && (
                                    <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                        <span className="text-xs font-bold text-emerald-700">Live Connection</span>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-8 min-h-[400px] flex items-center justify-center">
                            {isConnected ? (
                                <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
                                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center space-y-6">
                                        <div className="relative">
                                            <div className="h-24 w-24 rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
                                                <img
                                                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(instance?.name || "WA")}&background=0f172a&color=fff&size=128`}
                                                    alt="Profile"
                                                    className="h-full w-full rounded-full object-cover"
                                                />
                                            </div>
                                            <div className="absolute bottom-1 right-1 h-6 w-6 bg-white rounded-full flex items-center justify-center shadow border border-slate-100">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-current" />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <h3 className="text-xl font-bold text-slate-900">{instance?.name || "WhatsApp Business"}</h3>
                                            <p className="text-sm text-slate-500 font-medium">+62 ••• •••• ••••</p>
                                        </div>

                                        <div className="w-full pt-4 border-t border-slate-100">
                                            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                                                <div className="text-center">
                                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Status</p>
                                                    <p className="font-semibold text-emerald-600">Terhubung</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Latency</p>
                                                    <p className="font-semibold text-slate-700">~24ms</p>
                                                </div>
                                            </div>

                                            <Button
                                                variant="destructive"
                                                className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700 h-10 shadow-sm"
                                                onClick={handleDisconnect}
                                                disabled={isDisconnecting}
                                            >
                                                {isDisconnecting ? (
                                                    <>
                                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                                        Memutuskan...
                                                    </>
                                                ) : (
                                                    <>
                                                        <LogOut className="h-4 w-4 mr-2" />
                                                        Putuskan Koneksi
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : hasQR ? (
                                <div className="flex flex-col md:flex-row items-center gap-10 w-full max-w-2xl">
                                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm group">
                                        <div className="relative">
                                            <QRCodeSVG value={instance?.qrCode || ""} size={200} level="H" className="relative z-10" />
                                            {/* Stylized corners for QR */}
                                            <div className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-slate-900" />
                                            <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-slate-900" />
                                        </div>
                                        <p className="text-xs text-center text-slate-400 mt-4 animate-pulse uppercase tracking-widest">Menunggu...</p>
                                    </div>

                                    <div className="flex-1 space-y-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                                                <QrCode className="h-5 w-5 text-blue-600" />
                                                Tautkan Perangkat
                                            </h3>
                                            <p className="text-sm text-slate-500">Pindai kode QR untuk menghubungkan akun.</p>
                                        </div>

                                        <ol className="space-y-4 text-sm text-slate-700">
                                            <li className="flex gap-3 items-start">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 border border-slate-200 mt-0.5">1</span>
                                                <span>Buka <strong>WhatsApp</strong> di ponsel Anda.</span>
                                            </li>
                                            <li className="flex gap-3 items-start">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 border border-slate-200 mt-0.5">2</span>
                                                <span>Ketuk <strong>Menu</strong> (Android) atau <strong>Pengaturan</strong> (iOS).</span>
                                            </li>
                                            <li className="flex gap-3 items-start">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 border border-slate-200 mt-0.5">3</span>
                                                <span>Pilih <strong>Perangkat Tertaut</strong> lalu ketuk <strong>Tautkan Perangkat</strong>.</span>
                                            </li>
                                        </ol>
                                    </div>
                                </div>
                            ) : instance?.status === 'DISCONNECTING' ? (
                                <div className="text-center space-y-4 max-w-sm animate-in fade-in duration-300">
                                    <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100">
                                        <LogOut className="h-8 w-8 text-red-500 animate-pulse" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-bold text-slate-900">Memutuskan Koneksi</h3>
                                        <p className="text-sm text-slate-500 leading-relaxed">
                                            Sedang mengirim perintah logout ke WhatsApp. Mohon tunggu sebentar...
                                        </p>
                                    </div>
                                    <div className="flex justify-center pt-2">
                                        <div className="h-6 w-6 border-2 border-slate-200 border-t-red-500 rounded-full animate-spin" />
                                    </div>
                                </div>
                            ) : instance ? (
                                <div className="text-center space-y-4 max-w-sm animate-in fade-in duration-300">
                                    <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                                        <QrCode className="h-8 w-8 text-blue-500" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-bold text-slate-900">Menunggu QR Code</h3>
                                        <p className="text-sm text-slate-500 leading-relaxed">
                                            Koneksi telah diputus. Silakan tunggu beberapa detik, QR code baru akan muncul secara otomatis.
                                        </p>
                                    </div>
                                    <div className="flex justify-center pt-2">
                                        <div className="h-6 w-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center space-y-4 max-w-sm">
                                    <div className="h-16 w-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100">
                                        <AlertCircle className="h-8 w-8 text-amber-600" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-bold text-slate-900">Menunggu Worker Engine</h3>
                                        <p className="text-sm text-slate-500 leading-relaxed">
                                            Sistem backend tidak merespons. Pastikan service worker berjalan dengan perintah:
                                        </p>
                                        <code className="block bg-slate-900 text-slate-300 px-3 py-2 rounded-lg text-xs font-mono mt-3">
                                            npm run dev:worker
                                        </code>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Info */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Security Card */}
                    <Card className="border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white shadow-sm rounded-xl overflow-hidden">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-indigo-100/50 rounded-lg text-indigo-600">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <h3 className="font-semibold text-slate-900 text-sm">Keamanan Enkripsi</h3>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                Data sesi dan token autentikasi disimpan secara lokal dengan enkripsi AES-256. Kami tidak pernah menyimpan pesan Anda di server cloud.
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-indigo-600 font-medium uppercase tracking-wider">
                                <Lock className="h-3 w-3" />
                                <span>End-to-End Encrypted</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tips Card */}
                    <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
                        <CardHeader className="pb-3 border-b border-slate-50">
                            <div className="flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-slate-400" />
                                <span className="text-sm font-semibold text-slate-900">Tips Koneksi</span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5">
                            <ul className="space-y-4">
                                <li className="flex gap-3 items-start group">
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-300 mt-1.5 group-hover:bg-blue-500 transition-colors shrink-0" />
                                    <span className="text-xs text-slate-500 leading-relaxed group-hover:text-slate-700 transition-colors">
                                        Pastikan ponsel Anda memiliki koneksi internet yang stabil agar bot tetap online.
                                    </span>
                                </li>
                                <li className="flex gap-3 items-start group">
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-300 mt-1.5 group-hover:bg-blue-500 transition-colors shrink-0" />
                                    <span className="text-xs text-slate-500 leading-relaxed group-hover:text-slate-700 transition-colors">
                                        Jika terputus, sistem akan mencoba menghubungkan ulang secara otomatis setiap 30 detik.
                                    </span>
                                </li>
                                <li className="flex gap-3 items-start group">
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-300 mt-1.5 group-hover:bg-blue-500 transition-colors shrink-0" />
                                    <span className="text-xs text-slate-500 leading-relaxed group-hover:text-slate-700 transition-colors">
                                        Gunakan WhatsApp Business untuk performa broadcast yang lebih baik dan stabil.
                                    </span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
