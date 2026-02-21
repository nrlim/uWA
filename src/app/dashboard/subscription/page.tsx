"use client"

import { useStatus } from "@/contexts/StatusContext"
import { Check, MessageSquare, Zap, Star, Shield, ShieldAlert, CheckCircle2, Loader2, ArrowRight } from "lucide-react"
import Link from "next/link"
import Script from "next/script"
import { useState } from "react"

const DISCORD_URL = "https://discord.gg/your-discord-link"

const plans = [
    {
        name: "TRIAL",
        price: "Gratis",
        description: "Akses dasar untuk mencoba performa uWA.",
        features: [
            "100 Pesan / bulan",
            "1 Perangkat Terhubung",
            "5 Template Pesan",
            "Dukungan Komunitas"
        ],
        icon: Star,
        color: "text-slate-500",
        iconBg: "bg-slate-100",
        border: "border-slate-200",
        shadow: "shadow-sm hover:shadow-md",
        btnProps: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
    },
    {
        name: "STARTER",
        price: "Rp 99.000",
        period: "/bulan",
        description: "Validasi pasar & bisnis pemula.",
        features: [
            "1 Akun WhatsApp",
            "1.500 Pesan / bulan",
            "Human Mimicry (Anti-Banned)",
            "Template Dasar"
        ],
        icon: Zap,
        color: "text-blue-600",
        iconBg: "bg-blue-50",
        border: "border-slate-200",
        shadow: "shadow-sm hover:shadow-md",
        btnProps: "bg-white text-blue-600 hover:bg-blue-50 border border-blue-200"
    },
    {
        name: "PRO",
        price: "Rp 149.000",
        period: "/bulan",
        description: "Untuk pertumbuhan bisnis yang cepat.",
        features: [
            "3 Akun WhatsApp",
            "7.500 Pesan / bulan",
            "Human Mimicry (Advanced)",
            "Template Unlimited",
            "Prioritas Support"
        ],
        icon: Shield,
        color: "text-indigo-600",
        iconBg: "bg-indigo-50",
        border: "border-indigo-200 ring-4 ring-indigo-50", // Popular highlight
        shadow: "shadow-lg shadow-indigo-900/5",
        btnProps: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200 border border-transparent",
        popular: true
    },
    {
        name: "ELITE",
        price: "Rp 499.000",
        period: "/bulan",
        description: "Skala besar & Enterprise.",
        features: [
            "5 Akun WhatsApp",
            "Unlimited Pesan*",
            "AI Message Randomizer",
            "Full Features + API Access",
            "Dedicated Manager"
        ],
        icon: ShieldAlert,
        color: "text-orange-600",
        iconBg: "bg-orange-50",
        border: "border-slate-200",
        shadow: "shadow-sm hover:shadow-md",
        btnProps: "bg-white text-orange-600 hover:bg-orange-50 border border-orange-200"
    }
]

export default function SubscriptionPage() {
    const { user, isLoading } = useStatus()
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

    const handleSubscribe = async (planName: string) => {
        if (planName === 'TRIAL') return;

        try {
            setLoadingPlan(planName)
            const res = await fetch('/api/subscribe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: planName })
            })
            const data = await res.json()

            if (data.error) {
                alert(`Error: ${data.error}`)
                setLoadingPlan(null)
                return
            }

            if (data.token) {
                // @ts-ignore
                window.snap.pay(data.token, {
                    onSuccess: function (result: any) {
                        alert('Pembayaran berhasil! Silakan refresh halaman.');
                        setLoadingPlan(null)
                        window.location.reload();
                    },
                    onPending: function (result: any) {
                        alert('Menunggu pembayaran Anda!');
                        setLoadingPlan(null)
                    },
                    onError: function (result: any) {
                        alert('Pembayaran gagal!');
                        setLoadingPlan(null)
                    },
                    onClose: function () {
                        setLoadingPlan(null)
                    }
                })
            }
        } catch (error) {
            console.error(error)
            alert('Terjadi kesalahan saat menghubungi server.')
            setLoadingPlan(null)
        }
    }

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 min-h-[600px] rounded-3xl bg-white/50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin" />
                    <p className="text-sm text-slate-500 font-medium animate-pulse">Memuat data paket...</p>
                </div>
            </div>
        )
    }

    const currentPlan = user?.plan || "TRIAL"
    const currentPlanIndex = plans.findIndex(p => p.name === currentPlan)

    return (
        <div className="min-h-screen pb-10 space-y-8 animate-in fade-in duration-500">
            {/* Midtrans Script */}
            <Script
                src={process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true'
                    ? "https://app.midtrans.com/snap/snap.js"
                    : "https://app.sandbox.midtrans.com/snap/snap.js"}
                data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY as string}
                strategy="lazyOnload"
            />

            {/* Header */}
            <div className="max-w-3xl">
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
                    Layanan & Paket Langganan
                </h1>
                <p className="text-slate-600 text-base md:text-lg leading-relaxed">
                    Tingkatkan potensi broadcast WhatsApp Anda dengan infrastruktur uWA yang handal. Pilih paket sesuai skala operasional harian Anda.
                </p>
            </div>

            {/* Smart Status Banner (Light Theme) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm overflow-hidden relative">
                <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50 -z-10 -translate-y-1/2 translate-x-1/2" />

                <div className="flex items-center gap-4 z-10">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status Langganan</p>
                        <div className="flex items-center gap-3">
                            <span className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">{currentPlan}</span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold tracking-wider">
                                Aktif
                            </span>
                        </div>
                    </div>
                </div>

                <div className="w-full sm:w-auto flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6 z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Sisa Kredit</p>
                        <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {user?.credit === 9999999 ? 'Tanpa Batas' : user?.credit?.toLocaleString() || 0}
                        </p>
                    </div>
                </div>
            </div>

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
                {plans.map((plan, index) => {
                    const isCurrent = plan.name === currentPlan
                    const isDowngrade = index < currentPlanIndex
                    const Icon = plan.icon

                    return (
                        <div
                            key={plan.name}
                            className={`relative bg-white rounded-3xl border ${plan.border} ${plan.popular ? 'p-6 pt-10 lg:scale-[1.02] z-10' : 'p-6'} flex flex-col transition-all duration-300 ${plan.popular ? plan.shadow : 'shadow-sm hover:shadow-md'} overflow-hidden`}
                        >
                            {plan.popular && (
                                <div className="absolute top-0 left-0 w-full">
                                    <div className="bg-indigo-600 text-white text-[10px] uppercase font-bold tracking-widest text-center py-1.5 shadow-sm">
                                        Paling Populer
                                    </div>
                                </div>
                            )}

                            <div className={`flex items-center gap-4 mb-5`}>
                                <div className={`p-3.5 rounded-2xl ${plan.iconBg} flex items-center justify-center shrink-0`}>
                                    <Icon className={`w-5 h-5 md:w-6 md:h-6 ${plan.color}`} />
                                </div>
                                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{plan.name}</h3>
                            </div>

                            <div className="mb-6 flex-none">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl lg:text-3xl xl:text-4xl font-black text-slate-900 tracking-tight">{plan.price}</span>
                                </div>
                                {plan.period && <span className="text-sm font-semibold text-slate-500 mt-1 block px-1">{plan.period}</span>}
                                <p className="text-sm text-slate-600 mt-4 leading-relaxed line-clamp-2 md:h-10">
                                    {plan.description}
                                </p>
                            </div>

                            <div className="w-full h-px bg-slate-100 my-2" />

                            <ul className="space-y-4 my-6 flex-1">
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <div className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-emerald-50 flex items-center justify-center">
                                            <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                                        </div>
                                        <span className="text-sm text-slate-700 leading-snug font-medium">{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-auto pt-6">
                                {isCurrent ? (
                                    <button
                                        disabled
                                        className="w-full h-12 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-400 font-bold text-sm cursor-default flex items-center justify-center"
                                    >
                                        Plan Aktif
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleSubscribe(plan.name)}
                                        disabled={loadingPlan === plan.name}
                                        className={`w-full h-12 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 px-2 whitespace-nowrap overflow-hidden ${plan.btnProps}`}
                                    >
                                        {loadingPlan === plan.name ? (
                                            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                                        ) : (
                                            <ArrowRight className="w-4 h-4 shrink-0" />
                                        )}
                                        <span className="truncate">{loadingPlan === plan.name ? 'Memproses...' : (isDowngrade ? 'Downgrade Plan' : 'Pilih Paket')}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer Notice */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center mt-8 text-slate-500 text-sm shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-slate-50/50" />
                <span className="relative z-10">Transaksi diamankan dengan enkripsi end-to-end oleh Midtrans Gateway. Anda dapat mengelola limit kustom via Discord Admin.</span>
            </div>
        </div>
    )
}
