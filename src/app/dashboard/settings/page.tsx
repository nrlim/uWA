"use client"

import { useEffect, useState } from "react"
import { useStatus } from "@/contexts/StatusContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { User, Shield, Key, Bell, Save, CreditCard, CheckCircle2, Zap, AlertCircle, Loader2 } from "lucide-react"

export default function SettingsPage() {
    const { user, isLoading } = useStatus()
    const [isTurboMode, setIsTurboMode] = useState(false)
    const [workingHourStart, setWorkingHourStart] = useState(5)
    const [workingHourEnd, setWorkingHourEnd] = useState(23)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (!isLoading) {
            fetch('/api/settings').then(res => res.json()).then(data => {
                if (data && !data.error) {
                    setIsTurboMode(data.isTurboMode ?? false)
                    setWorkingHourStart(data.workingHourStart ?? 5)
                    setWorkingHourEnd(data.workingHourEnd ?? 23)
                }
            })
        }
    }, [isLoading])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isTurboMode, workingHourStart, workingHourEnd })
            })
            alert('Pengaturan Global berhasil disimpan!')
        } catch (error) {
            alert('Gagal menyimpan pengaturan')
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="h-8 w-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm font-medium animate-pulse">Memuat pengaturan...</p>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pengaturan & Akun</h1>
                    <p className="text-slate-500 text-sm mt-1">Kelola preferensi akun, plan langganan, dan keamanan engine.</p>
                </div>
                <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 text-white hover:bg-slate-800 h-10 px-5 rounded-lg gap-2 font-bold shadow-sm transition-all text-sm">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Simpan Perubahan
                </Button>
            </div>

            <div className="grid gap-8">
                {/* Subscription & Credit Section (New) */}
                <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
                    <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
                        <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-slate-500" />
                            Langganan & Kredit
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid md:grid-cols-2 gap-8 items-center">
                            {/* Plan Badge */}
                            <div className="space-y-4">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan Saat Ini</Label>
                                <div className="flex items-center gap-4">
                                    <div className={`h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold border-2 
                                        ${user?.plan === 'ELITE' ? 'bg-purple-50 border-purple-100 text-purple-600' :
                                            user?.plan === 'PRO' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                                                user?.plan === 'STARTER' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                                                    'bg-slate-100 border-slate-200 text-slate-600'
                                        }`}>
                                        {user?.plan?.[0] || 'T'}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">{user?.plan || 'TRIAL'}</h3>
                                        <p className="text-sm text-slate-500">
                                            {user?.plan === 'ELITE' ? 'Unlimited Access & Priority Support' :
                                                user?.plan === 'PRO' ? 'High Volume Broadcasts' :
                                                    'Basic Features for Starters'}
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" className="mt-2 text-xs h-8">Upgrade Plan</Button>
                            </div>

                            {/* Credit Stats */}
                            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-slate-700">Sisa Kredit Pesan</span>
                                    <Badge variant="secondary" className="bg-white border border-slate-200 text-slate-900 font-bold">
                                        Active
                                    </Badge>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-bold text-blue-600 tracking-tight">{user?.credit?.toLocaleString() || '0'}</span>
                                    <span className="text-sm text-slate-500 font-medium">kredit</span>
                                </div>
                                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 w-full animate-pulse" style={{ width: '100%' }}></div>
                                    {/* TODO: Calculate percentage if monthly limit is known */}
                                </div>
                                <p className="text-xs text-slate-400">
                                    Kredit akan berkurang setiap pesan broadcast terkirim sukses via WhatsApp API.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Profile Section */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
                            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                <User className="h-4 w-4 text-slate-500" />
                                Profil Akun
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Username</Label>
                                <Input defaultValue={user?.name || '-'} className="h-10 border-slate-200 bg-slate-50 text-slate-600 font-medium" disabled />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</Label>
                                <Input defaultValue={user?.email || '-'} className="h-10 border-slate-200 bg-slate-50 text-slate-600 font-medium" disabled />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Global Safety Section */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
                            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                <Shield className="h-4 w-4 text-slate-500" />
                                Keamanan & Engine
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            {/* Turbo Mode Toggle */}
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                            Turbo Mode
                                            <Zap className="h-4 w-4 text-slate-500" />
                                        </Label>
                                        <p className="text-xs text-slate-500 mt-1">Nonaktifkan jeda istirahat malam (24/7 Engine Run).</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsTurboMode(!isTurboMode)}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${isTurboMode ? 'bg-slate-900' : 'bg-slate-300'}`}
                                    >
                                        <span aria-hidden="true" className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isTurboMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                {isTurboMode && (
                                    <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-medium flex items-start gap-3 shadow-inner">
                                        <AlertCircle className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                                        <p className="leading-relaxed">Mode Turbo menonaktifkan jeda istirahat malam. Gunakan dengan bijak untuk meminimalisir risiko deteksi.</p>
                                    </div>
                                )}

                                {!isTurboMode && (
                                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500 uppercase">Jam Mulai</Label>
                                            <Input type="number" min="0" max="23" value={workingHourStart} onChange={(e) => setWorkingHourStart(Number(e.target.value))} className="h-9 border-slate-200 font-mono text-center bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-slate-500 uppercase">Jam Selesai</Label>
                                            <Input type="number" min="0" max="23" value={workingHourEnd} onChange={(e) => setWorkingHourEnd(Number(e.target.value))} className="h-9 border-slate-200 font-mono text-center bg-white" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 bg-amber-50 p-3 rounded-lg border border-amber-100 text-xs text-amber-800">
                                <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                                <p>Pengaturan ini menjadi default untuk setiap kampanye baru. Delay yang lebih lama mengurangi risiko blokir.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* API Section */}
                <Card className="border border-slate-200 shadow-sm opacity-70">
                    <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
                        <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                            <Key className="h-4 w-4 text-slate-500" />
                            API Access
                            <Badge variant="secondary" className="text-[10px] bg-slate-200 text-slate-600 hover:bg-slate-200">COMING SOON</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex gap-4">
                            <Input value="uWA_sk_live_xxxxxxxxxxxxx" className="h-10 border-slate-200 font-mono text-slate-400 bg-slate-50" disabled />
                            <Button variant="outline" className="h-10 border-slate-200 text-slate-500" disabled>Regenerate</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
