"use client"

import Link from "next/link"
import Image from "next/image"
import {
    ShieldCheck,
    Zap,
    Users,
    ArrowRight,
    Menu,
    X,
    MessageSquare,
    Play,
    CheckCircle2,
    BarChart3,
    Globe,
    Smartphone,
    LayoutDashboard,
    Quote
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useState, useRef } from "react"

export default function LandingPage() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    const handlePlay = () => {
        setIsPlaying(true)
        if (videoRef.current) {
            videoRef.current.play()
        }
    }

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans scroll-smooth">
            {/* HEADER */}
            <header className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200 z-50 transition-all duration-300">
                <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center">
                        <div className="flex items-center justify-center -ml-4 -mr-3">
                            <Image src="/images/main-logo.png" alt="uWA Logo" width={80} height={80} className="object-contain drop-shadow-md" />
                        </div>
                        <span className="font-bold text-2xl tracking-tight text-slate-900">uWA</span>
                    </div>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-10">
                        <Link href="#fitur" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Fitur</Link>
                        <Link href="#cara-kerja" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Cara Kerja</Link>
                        <Link href="#harga" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Harga</Link>
                        <div className="flex items-center gap-4">
                            <Link href="/login">
                                <Button className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 h-10 rounded-full text-sm shadow-md hover:shadow-lg transition-all">
                                    Masuk
                                </Button>
                            </Link>
                        </div>
                    </nav>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </button>
                </div>

                {/* Mobile Menu */}
                {isMenuOpen && (
                    <div className="md:hidden absolute top-20 left-0 w-full bg-white border-b border-slate-200 p-6 flex flex-col gap-4 shadow-xl animate-in slide-in-from-top-2">
                        <Link href="#fitur" className="text-lg font-medium text-slate-900 p-2 hover:bg-slate-50 rounded" onClick={() => setIsMenuOpen(false)}>Fitur</Link>
                        <Link href="#cara-kerja" className="text-lg font-medium text-slate-900 p-2 hover:bg-slate-50 rounded" onClick={() => setIsMenuOpen(false)}>Cara Kerja</Link>
                        <Link href="#testimoni" className="text-lg font-medium text-slate-900 p-2 hover:bg-slate-50 rounded" onClick={() => setIsMenuOpen(false)}>Testimoni</Link>
                        <Link href="#harga" className="text-lg font-medium text-slate-900 p-2 hover:bg-slate-50 rounded" onClick={() => setIsMenuOpen(false)}>Harga</Link>
                        <div className="pt-2">
                            <Link href="/dashboard" onClick={() => setIsMenuOpen(false)}>
                                <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white text-lg h-12 rounded-lg font-semibold">Akses Dashboard</Button>
                            </Link>
                        </div>
                    </div>
                )}
            </header>

            <main className="flex-1 pt-20">

                {/* HERO SECTION */}
                <section className="pt-10 pb-24 md:pt-20 md:pb-32 relative overflow-hidden bg-white">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-transparent to-transparent opacity-70 pointer-events-none"></div>

                    <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center relative z-10">
                        <div className="max-w-2xl">
                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-6 leading-[1.1]">
                                Otomasi WhatsApp <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-blue-600">Paling Handal</span> untuk Bisnis Anda.
                            </h1>

                            <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-lg">
                                Kirim pesan promosi dengan cerdas, aman, dan pantau hasilnya secara real-time. Platform enterprise-grade untuk pertumbuhan tanpa batas.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <Link href="/dashboard">
                                    <Button size="lg" className="h-14 px-8 text-base font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 w-full sm:w-auto rounded-full">
                                        Mulai Sekarang <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="#cara-kerja">
                                    <Button variant="outline" size="lg" className="h-14 px-8 text-base font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 w-full sm:w-auto rounded-full">
                                        Lihat Demo
                                    </Button>
                                </Link>
                            </div>

                            <div className="mt-10 flex items-center gap-6 text-sm text-slate-500 font-medium">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-teal-600" /> Setup Instan
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-teal-600" /> Tanpa Kartu Kredit
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-teal-600" /> 14 Hari Gratis
                                </div>
                            </div>
                        </div>

                        <div className="relative hidden lg:block">
                            <div className="absolute -inset-1 bg-gradient-to-r from-teal-500 to-blue-600 rounded-2xl blur opacity-20"></div>
                            <div className="relative bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden transform rotate-1 hover:rotate-0 transition-transform duration-500">
                                <div className="h-12 bg-slate-800 border-b border-slate-700 flex items-center px-4 gap-2">
                                    <div className="h-3 w-3 rounded-full bg-red-500"></div>
                                    <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                                </div>
                                <div className="p-1">
                                    <div className="aspect-[16/10] bg-slate-950 flex text-slate-400 font-sans relative overflow-hidden">
                                        {/* Sidebar Mock */}
                                        <div className="w-16 border-r border-slate-800 bg-slate-900/50 flex flex-col items-center py-6 gap-6 z-10">
                                            <div className="flex items-center justify-center"><Image src="/images/main-logo.png" alt="uWA Logo" width={56} height={56} className="object-contain" /></div>
                                            <div className="w-full h-px bg-slate-800"></div>
                                            <div className="h-8 w-8 text-slate-500 hover:text-white cursor-pointer"><LayoutDashboard className="h-5 w-5" /></div>
                                            <div className="h-8 w-8 text-slate-500 hover:text-white cursor-pointer"><Users className="h-5 w-5" /></div>
                                            <div className="h-8 w-8 text-slate-500 hover:text-white cursor-pointer"><MessageSquare className="h-5 w-5" /></div>
                                            <div className="mt-auto h-8 w-8 text-slate-500 hover:text-white cursor-pointer"><ShieldCheck className="h-5 w-5" /></div>
                                        </div>

                                        {/* Main Content Mock */}
                                        <div className="flex-1 p-6 relative">
                                            {/* Header */}
                                            <div className="flex justify-between items-center mb-8">
                                                <div>
                                                    <h3 className="text-white font-bold text-lg tracking-tight">Campaign Overview</h3>
                                                    <p className="text-xs text-slate-500">Real-time performance analytics</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-1 rounded-md border border-emerald-500/20 flex items-center gap-1.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                        System Online
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-3 gap-4 mb-8">
                                                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-colors">
                                                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-bl-full -mr-2 -mt-2"></div>
                                                    <div className="text-slate-500 text-xs font-medium mb-1">Total Broadcast</div>
                                                    <div className="text-2xl font-bold text-white mb-1">12,450</div>
                                                    <div className="text-xs text-emerald-400 flex items-center gap-1">+12.5% <span className="text-slate-600">vs last week</span></div>
                                                </div>
                                                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-colors">
                                                    <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-bl-full -mr-2 -mt-2"></div>
                                                    <div className="text-slate-500 text-xs font-medium mb-1">Success Rate</div>
                                                    <div className="text-2xl font-bold text-white mb-1">99.8%</div>
                                                    <div className="text-xs text-emerald-400 flex items-center gap-1">+0.2% <span className="text-slate-600">stable</span></div>
                                                </div>
                                                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden group hover:border-slate-700 transition-colors">
                                                    <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-bl-full -mr-2 -mt-2"></div>
                                                    <div className="text-slate-500 text-xs font-medium mb-1">Response</div>
                                                    <div className="text-2xl font-bold text-white mb-1">1,203</div>
                                                    <div className="text-xs text-emerald-400 flex items-center gap-1">+5.4% <span className="text-slate-600">engagement</span></div>
                                                </div>
                                            </div>

                                            {/* Chart Area Mock */}
                                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-40 relative overflow-hidden">
                                                <div className="flex justify-between items-end h-full w-full gap-2 relative z-10 px-2 pb-2">
                                                    {/* CSS Chart Bars */}
                                                    {[35, 45, 30, 60, 75, 50, 65, 80, 70, 90, 65, 85].map((height, i) => (
                                                        <div key={i} className="w-full bg-slate-800 rounded-t-sm relative group">
                                                            <div
                                                                className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 to-teal-400 rounded-t-sm opacity-60 group-hover:opacity-100 transition-all duration-300"
                                                                style={{ height: `${height}%` }}
                                                            ></div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* Grid Lines */}
                                                <div className="absolute inset-0 px-5 py-5 flex flex-col justify-between pointer-events-none">
                                                    <div className="w-full h-px bg-slate-800/50 border-t border-dashed border-slate-800"></div>
                                                    <div className="w-full h-px bg-slate-800/50 border-t border-dashed border-slate-800"></div>
                                                    <div className="w-full h-px bg-slate-800/50 border-t border-dashed border-slate-800"></div>
                                                </div>
                                            </div>

                                            {/* Floating notification */}
                                            <div className="absolute bottom-6 right-6 bg-slate-800 border border-slate-700 p-3 rounded-lg shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                                                <div className="text-xs text-slate-300">Campaign <span className="text-white font-medium">Promo Feb</span> finished.</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* WHY UWA (VALUE PROP) */}
                <section className="py-24 bg-slate-50 border-y border-slate-200">
                    <div className="container mx-auto px-6">
                        <div className="grid md:grid-cols-3 gap-12 text-center md:text-left">
                            <div className="flex flex-col items-center md:items-start">
                                <div className="h-16 w-16 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center text-teal-600 mb-6">
                                    <ShieldCheck className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Anti-Banned Cerdas</h3>
                                <p className="text-slate-600 leading-relaxed">
                                    Teknologi simulasi perilaku manusia dan interval acak menjaga nomor Anda tetap aman dari blokir otomatis.
                                </p>
                            </div>
                            <div className="flex flex-col items-center md:items-start">
                                <div className="h-16 w-16 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center text-blue-600 mb-6">
                                    <Zap className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Efisiensi Maksimal</h3>
                                <p className="text-slate-600 leading-relaxed">
                                    Kirim ribuan pesan dalam sekali klik. Hemat waktu operasional tim Anda hingga 90% setiap hari.
                                </p>
                            </div>
                            <div className="flex flex-col items-center md:items-start">
                                <div className="h-16 w-16 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center text-indigo-600 mb-6">
                                    <BarChart3 className="h-8 w-8" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Data Akurat & Real-time</h3>
                                <p className="text-slate-600 leading-relaxed">
                                    Dapatkan wawasan mendalam tentang performa kampanye. Pantau tingkat keterbacaan dan konversi secara langsung.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* HOW IT WORKS (DEMO) */}
                <section id="cara-kerja" className="py-32 bg-slate-900 text-white relative">
                    <div className="container mx-auto px-6">
                        <div className="text-center max-w-3xl mx-auto mb-16">
                            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-white">Cara Kerja uWA</h2>
                            <p className="text-xl text-slate-400">Tiga langkah sederhana untuk memulai kampanye otomatisasi Anda.</p>
                        </div>

                        {/* Video Container */}
                        <div className="relative max-w-5xl mx-auto mb-20 group">
                            <div
                                className="rounded-2xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-950 aspect-video relative cursor-pointer"
                                onClick={!isPlaying ? handlePlay : undefined}
                            >
                                <video
                                    ref={videoRef}
                                    className={`w-full h-full object-cover transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-80 group-hover:opacity-90'}`}
                                    playsInline
                                    controls={isPlaying}
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    poster="https://placehold.co/1920x1080/0f172a/ffffff?text=uWA+Dashboard+Demo"
                                >
                                    <source src="/videos/howitworks-demo.mp4" type="video/mp4" />
                                </video>

                                {!isPlaying && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all group-hover:bg-black/10">
                                        <div className="h-24 w-24 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 shadow-xl group-hover:scale-110 transition-transform duration-300">
                                            <Play className="h-10 w-10 text-white fill-white ml-1" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Glow Effect */}
                            <div className="absolute -inset-4 bg-teal-500/20 rounded-[2rem] blur-2xl -z-10 opacity-50"></div>
                        </div>

                        {/* Steps */}
                        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-teal-500/50 transition-colors">
                                <div className="text-5xl font-bold text-slate-700 mb-4 opacity-50">01</div>
                                <h3 className="text-xl font-bold text-white mb-2">Koneksikan Akun</h3>
                                <p className="text-slate-400">Scan QR Code WhatsApp di dashboard uWA. Terhubung dalam hitungan detik tanpa instalasi software.</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors">
                                <div className="text-5xl font-bold text-slate-700 mb-4 opacity-50">02</div>
                                <h3 className="text-xl font-bold text-white mb-2">Susun Kampanye</h3>
                                <p className="text-slate-400">Upload database kontak, tulis pesan dengan personalisasi, dan atur jadwal pengiriman.</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-colors">
                                <div className="text-5xl font-bold text-slate-700 mb-4 opacity-50">03</div>
                                <h3 className="text-xl font-bold text-white mb-2">Pantau Hasil</h3>
                                <p className="text-slate-400">Duduk tenang dan biarkan sistem bekerja. Pantau laporan pengiriman secara real-time.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FEATURES GRID */}
                <section id="fitur" className="py-32 bg-white">
                    <div className="container mx-auto px-6">
                        <div className="text-center max-w-3xl mx-auto mb-20">
                            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Fitur Unggulan</h2>
                            <p className="text-xl text-slate-500">
                                Dirancang khusus untuk kebutuhan profesional yang menuntut performa tinggi.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                            <Card className="border-slate-100 shadow-sm hover:shadow-xl transition-all hover:border-slate-200">
                                <CardHeader>
                                    <div className="h-12 w-12 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600 mb-4">
                                        <ShieldCheck className="h-6 w-6" />
                                    </div>
                                    <CardTitle>Algoritma Anti-Banned</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-base text-slate-600">
                                        Perlindungan berlapis dengan random delay dan simulasi typing untuk keamanan maksimal.
                                    </CardDescription>
                                </CardContent>
                            </Card>

                            <Card className="border-slate-100 shadow-sm hover:shadow-xl transition-all hover:border-slate-200">
                                <CardHeader>
                                    <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                                        <MessageSquare className="h-6 w-6" />
                                    </div>
                                    <CardTitle>Spintax Dinamis</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-base text-slate-600">
                                        Buat ribuan variasi pesan unik secara otomatis untuk menghindari deteksi spam filter.
                                    </CardDescription>
                                </CardContent>
                            </Card>

                            <Card className="border-slate-100 shadow-sm hover:shadow-xl transition-all hover:border-slate-200">
                                <CardHeader>
                                    <div className="h-12 w-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
                                        <LayoutDashboard className="h-6 w-6" />
                                    </div>
                                    <CardTitle>Dashboard Real-time</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-base text-slate-600">
                                        Visualisasi data pengiriman yang lengkap dan mudah dipahami dalam satu tampilan layar.
                                    </CardDescription>
                                </CardContent>
                            </Card>

                            <Card className="border-slate-100 shadow-sm hover:shadow-xl transition-all hover:border-slate-200">
                                <CardHeader>
                                    <div className="h-12 w-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-4">
                                        <Users className="h-6 w-6" />
                                    </div>
                                    <CardTitle>Manajemen Kontak</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-base text-slate-600">
                                        Import/Export data kontak dengan mudah. Grouping dan filtering untuk target yang spesifik.
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* PRICING */}
                <section id="harga" className="py-32 bg-white border-t border-slate-100">
                    <div className="container mx-auto px-6">
                        <div className="text-center max-w-3xl mx-auto mb-20">
                            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Harga Transparan</h2>
                            <p className="text-xl text-slate-500">
                                Pilih paket yang sesuai dengan kebutuhan automasi Anda. Upgrade kapan saja.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">

                            {/* Starter Plan */}
                            <div className="p-8 rounded-3xl border border-slate-200 bg-white hover:border-slate-300 transition-colors">
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Starter</h3>
                                <p className="text-slate-500 mb-6 text-sm">Validasi pasar & bisnis pemula.</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-slate-900">RP 99rb</span>
                                    <span className="text-slate-500 text-sm">/bulan</span>
                                </div>
                                <Link href="/register?plan=starter">
                                    <Button variant="outline" className="w-full rounded-xl h-12 border-slate-300 font-semibold mb-8 hover:bg-slate-50 hover:text-slate-900">
                                        Pilih Starter
                                    </Button>
                                </Link>
                                <ul className="space-y-4 text-sm text-slate-600">
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> 1 Akun WhatsApp</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> 1.500 Pesan / bulan</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> Human Mimicry (Anti-Banned)</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> Template Dasar</li>
                                </ul>
                            </div>

                            {/* Pro Plan */}
                            <div className="p-8 rounded-3xl border-2 border-indigo-500 bg-slate-50 relative transform md:-translate-y-4 shadow-xl">
                                <div className="absolute top-0 right-0 bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-bl-xl rounded-tr-2xl tracking-wide uppercase">Best Value</div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Pro</h3>
                                <p className="text-slate-500 mb-6 text-sm">Untuk pertumbuhan bisnis yang cepat.</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-slate-900">RP 149rb</span>
                                    <span className="text-slate-500 text-sm">/bulan</span>
                                </div>
                                <Link href="/register?plan=pro">
                                    <Button className="w-full rounded-xl h-12 bg-indigo-600 hover:bg-indigo-700 font-semibold mb-8 text-white shadow-md">
                                        Pilih Pro
                                    </Button>
                                </Link>
                                <ul className="space-y-4 text-sm text-slate-700 font-medium">
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" /> 3 Akun WhatsApp</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" /> 7.500 Pesan / bulan</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" /> Human Mimicry (Advanced)</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" /> Template Unlimited</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" /> Prioritas Support</li>
                                </ul>
                            </div>

                            {/* Elite Plan */}
                            <div className="p-8 rounded-3xl border border-slate-200 bg-white hover:border-slate-300 transition-colors">
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Elite</h3>
                                <p className="text-slate-500 mb-6 text-sm">Skala besar & Enterprise.</p>
                                <div className="mb-6">
                                    <span className="text-4xl font-bold text-slate-900">RP 299rb</span>
                                    <span className="text-slate-500 text-sm">/bulan</span>
                                </div>
                                <Link href="/register?plan=elite">
                                    <Button variant="outline" className="w-full rounded-xl h-12 border-slate-300 font-semibold mb-8 hover:bg-slate-50 hover:text-slate-900">
                                        Pilih Elite
                                    </Button>
                                </Link>
                                <ul className="space-y-4 text-sm text-slate-600">
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> 5 Akun WhatsApp</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> Unlimited Pesan*</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> AI Message Randomizer</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> Full Features + API Access</li>
                                    <li className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" /> Dedicated Manager</li>
                                </ul>
                            </div>

                        </div>
                    </div>
                </section>

            </main>

            {/* FOOTER */}
            <footer className="bg-slate-950 py-12 border-t border-slate-900">
                <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center">
                        <div className="flex items-center justify-center -ml-3 -mr-3">
                            <Image src="/images/main-logo.png" alt="uWA Logo" width={64} height={64} className="object-contain drop-shadow-sm" />
                        </div>
                        <span className="text-slate-200 font-semibold text-lg">uWA</span>
                    </div>

                    <div className="text-slate-500 text-sm">
                        &copy; {new Date().getFullYear()} uWA Technology. All rights reserved.
                    </div>

                    <div className="flex gap-6 text-sm font-medium text-slate-400">
                        <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
                        <Link href="#" className="hover:text-white transition-colors">Terms</Link>
                        <Link href="#" className="hover:text-white transition-colors">Contact</Link>
                    </div>
                </div>
            </footer>
        </div>
    )
}
