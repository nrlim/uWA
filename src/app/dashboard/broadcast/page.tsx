"use client"

import { useState, useRef, useEffect } from "react"
import { useStatus } from "@/contexts/StatusContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog"
import {
    AlertCircle,
    Loader2,
    Play,
    Settings2,
    Users,
    Zap,
    CheckCircle2,
    ChevronRight,
    FileText,
    Variable,
    Save,
    Layout,
    Clock,
    ShieldAlert,
    Upload
} from "lucide-react"
import { useRouter } from "next/navigation"

export default function BroadcastPage() {
    const { activeBroadcast, isLoading: isStatusLoading, user } = useStatus()
    const router = useRouter()

    // Form State
    const [name, setName] = useState(`Kampanye-${new Date().toISOString().split('T')[0]}`)
    const [message, setMessage] = useState("")
    const [file, setFile] = useState<File | null>(null)
    const [contacts, setContacts] = useState<string[]>([])
    const [delayMin, setDelayMin] = useState(20)
    const [delayMax, setDelayMax] = useState(60)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState("manual")
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Template State
    const [templates, setTemplates] = useState<{ id: string; title: string; content: string }[]>([])
    const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
    const [templateTitle, setTemplateTitle] = useState("")
    const [savingTemplate, setSavingTemplate] = useState(false)

    // For auto-scrolling preview
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }
        // Fetch templates
        fetch('/api/templates')
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setTemplates(data) })
            .catch(() => { })
    }, [])

    // Handle File Upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0]
            setFile(f)
            const text = await f.text()
            const rawNumbers = text.match(/[\d\+\-\(\)\s]+/g) || []
            const cleaned = rawNumbers
                .map(n => n.replace(/\D/g, ""))
                .filter(n => n.length >= 10)
            const unique = Array.from(new Set(cleaned))
            setContacts(unique)
        }
    }

    // Handle Save as Template
    const handleSaveAsTemplate = async () => {
        if (!templateTitle.trim() || !message.trim()) return
        setSavingTemplate(true)
        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: templateTitle, content: message })
            })
            if (res.ok) {
                const newT = await res.json()
                setTemplates(prev => [newT, ...prev])
                setSaveTemplateOpen(false)
                setTemplateTitle("")
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSavingTemplate(false)
        }
    }

    const insertTag = (tag: string) => {
        setMessage(prev => prev + tag + " ")
    }

    // Handle Submit
    const handleSubmit = async () => {
        if (!contacts.length || !message) return

        // Client-side Credit Check
        if (user && user.credit < contacts.length) {
            setError(`Kredit tidak mencukupi. Anda butuh ${contacts.length} kredit, tapi hanya punya ${user.credit}.`)
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const res = await fetch("/api/broadcast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    message,
                    recipients: contacts,
                    delayMin: Number(delayMin),
                    delayMax: Number(delayMax)
                })
            })

            if (!res.ok) throw new Error("Gagal membuat kampanye")
            router.push("/dashboard")
        } catch (err) {
            console.error(err)
            setError("Gagal memulai broadcast. Silakan coba lagi.")
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isStatusLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="h-8 w-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm font-medium animate-pulse">Memuat engine...</p>
            </div>
        )
    }

    const isLocked = !!activeBroadcast && activeBroadcast.status === 'RUNNING'
    const estimatedTime = ((contacts.length * ((Number(delayMin) + Number(delayMax)) / 2)) / 60).toFixed(1)
    const insufficientCredits = user ? user.credit < contacts.length : false

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-10">
            {/* Header */}
            <div className="pb-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Broadcast Baru</h1>
                    <p className="text-slate-500 text-sm mt-1">Konfigurasi pesan dan target audiens kampanye Anda.</p>
                </div>
            </div>

            {isLocked && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3 text-amber-800 shadow-sm items-start">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-semibold text-sm">Kampanye Sedang Berjalan</h4>
                        <p className="text-amber-700/80 text-xs mt-1">
                            Sistem sedang memproses <strong>{activeBroadcast.name}</strong>. Fitur broadcast baru dikunci hingga selesai.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT COLUMN: Main Form Flow (8/12) */}
                <div className="lg:col-span-8 space-y-8">

                    {/* STEP 1: CAMPAIGN IDENTITY & CONTENT */}
                    <Card className="border border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">1</div>
                                    Setup & Konten
                                </CardTitle>
                                <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] font-bold px-2 py-0.5">
                                    SPINTAX ACTIVE
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            {/* Campaign Name */}
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Kampanye</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="h-10 border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 placeholder:text-slate-300"
                                    placeholder="Contoh: Promo Ramadhan 2026"
                                    disabled={isLocked}
                                />
                            </div>

                            {/* Message Area */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Konten Pesan</Label>

                                    {/* Template Selector Inline */}
                                    {templates.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <Layout className="h-3 w-3 text-slate-400" />
                                            <select
                                                className="text-xs border-none bg-transparent text-blue-600 font-medium cursor-pointer focus:ring-0 p-0 pr-1 hover:underline"
                                                onChange={(e) => {
                                                    const t = templates.find(t => t.id === e.target.value)
                                                    if (t) setMessage(t.content)
                                                }}
                                                defaultValue=""
                                                disabled={isLocked}
                                            >
                                                <option value="" disabled>Pilih Template...</option>
                                                {templates.map(t => (
                                                    <option key={t.id} value={t.id}>{t.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <Textarea
                                        placeholder="Halo {Nama}, kami memiliki penawaran {spesial|eksklusif} untuk Anda..."
                                        className="min-h-[200px] border-slate-200 focus:border-blue-500 focus:ring-blue-500/10 resize-none p-4 text-sm leading-relaxed text-slate-700 selection:bg-blue-100 rounded-xl"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        disabled={isLocked}
                                    />
                                    <div className="absolute bottom-3 right-3 flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-[10px] text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-100"
                                            onClick={() => { setTemplateTitle(""); setSaveTemplateOpen(true) }}
                                            disabled={!message || isLocked}
                                        >
                                            <Save className="h-3 w-3 mr-1" /> Simpan
                                        </Button>
                                    </div>
                                </div>

                                {/* Smart Tags Toolbar */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase mr-1">Smart Tags:</span>
                                    <button onClick={() => insertTag("{Nama}")} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors border border-slate-200">
                                        + Nama
                                    </button>
                                    <button onClick={() => insertTag("{Var1}")} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors border border-slate-200">
                                        + Var 1
                                    </button>
                                    <button onClick={() => insertTag("{Tanggal}")} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors border border-slate-200">
                                        + Tanggal
                                    </button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* STEP 2: AUDIENCE SELECTION */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
                            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">2</div>
                                Target Audiens
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100 p-1 rounded-lg">
                                    <TabsTrigger value="manual" className="text-xs font-medium rounded-md">Input Manual</TabsTrigger>
                                    <TabsTrigger value="upload" className="text-xs font-medium rounded-md">Upload File</TabsTrigger>
                                </TabsList>

                                <TabsContent value="manual" className="mt-0">
                                    <Textarea
                                        placeholder="Tempel nomor telepon di sini (satu per baris)..."
                                        className="min-h-[120px] border-slate-200 font-mono text-sm leading-relaxed rounded-xl focus:ring-blue-500/10"
                                        onChange={(e) => {
                                            const text = e.target.value;
                                            const rawNumbers = text.match(/[\d\+\-\(\)\s]+/g) || [];
                                            const cleaned = rawNumbers.map(n => n.replace(/\D/g, "")).filter(n => n.length >= 10);
                                            setContacts(Array.from(new Set(cleaned)));
                                        }}
                                        disabled={isLocked}
                                    />
                                    <p className="text-[10px] text-slate-400 text-right mt-2">
                                        Mendukung format +62, 08, 62.
                                    </p>
                                </TabsContent>

                                <TabsContent value="upload" className="mt-0">
                                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50/50 hover:border-blue-400 transition-all cursor-pointer relative group">
                                        <Input
                                            type="file"
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                                            accept=".txt,.csv"
                                            onChange={handleFileUpload}
                                            disabled={isLocked}
                                        />
                                        <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                            <Upload className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <p className="font-semibold text-slate-900 text-sm group-hover:text-blue-700">
                                            {file ? file.name : "Klik untuk upload file kontak"}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">Format .csv atau .txt (Maks 10MB)</p>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            {/* Audience Summary */}
                            {contacts.length > 0 && (
                                <div className="mt-4 flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                        <span className="text-sm font-semibold text-emerald-900">{contacts.length} Penerima Valid</span>
                                    </div>
                                    <button onClick={() => { setContacts([]); setFile(null) }} className="text-xs text-emerald-700 hover:text-emerald-900 font-medium underline">
                                        Reset
                                    </button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* STEP 3: SENDING LOGIC */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
                            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">3</div>
                                Logika Pengiriman
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        Interval Pengiriman
                                        <ShieldAlert className="h-3 w-3 text-emerald-600" />
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Input
                                                type="number"
                                                value={delayMin}
                                                onChange={(e) => setDelayMin(Number(e.target.value))}
                                                className="pl-3 pr-8 h-10 font-mono text-sm"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-slate-400">s</span>
                                        </div>
                                        <span className="text-slate-400 font-medium">–</span>
                                        <div className="relative flex-1">
                                            <Input
                                                type="number"
                                                value={delayMax}
                                                onChange={(e) => setDelayMax(Number(e.target.value))}
                                                className="pl-3 pr-8 h-10 font-mono text-sm"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-slate-400">s</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400">Sistem akan mengacak jeda antara {delayMin}-{delayMax} detik untuk menghindari blokir.</p>
                                </div>

                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex flex-col justify-center">
                                    <div className="text-xs text-slate-500 mb-1">Estimasi Selesai</div>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-bold text-slate-900">~{estimatedTime}</span>
                                        <span className="text-sm font-medium text-slate-500">Menit</span>
                                    </div>
                                </div>
                            </div>

                            {/* Primary Action Button */}
                            <div className="pt-4 border-t border-slate-100">
                                <Button
                                    size="lg"
                                    className="w-full h-14 text-base font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xl shadow-slate-900/10 transition-all rounded-xl"
                                    onClick={handleSubmit}
                                    disabled={isLocked || isSubmitting || !contacts.length || !message || insufficientCredits}
                                >
                                    {isSubmitting ? (
                                        <><Loader2 className="h-5 w-5 mr-3 animate-spin" /> Sedang Memproses Broadcast...</>
                                    ) : insufficientCredits ? (
                                        <><AlertCircle className="h-5 w-5 mr-3 text-red-300" /> Kredit Tidak Mencukupi</>
                                    ) : (
                                        <><Play className="h-5 w-5 mr-3 fill-current" /> Mulai Broadcast Sekarang</>
                                    )}
                                </Button>
                                {error && (
                                    <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center flex items-center justify-center gap-2">
                                        <AlertCircle className="h-4 w-4" /> {error}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>


                </div>

                {/* RIGHT COLUMN: Sticky Preview (4/12) */}
                <div className="lg:col-span-4">
                    <div className="sticky top-8 space-y-6">
                        <div className="flex items-center justify-between text-sm mb-4 px-2">
                            <span className="font-semibold text-slate-900">Live Preview</span>
                            <span className="text-xs text-slate-400">WhatsApp Android</span>
                        </div>

                        {/* Smartphone Mockup */}
                        <div className="bg-slate-800 rounded-[2.5rem] p-3 shadow-2xl border-[4px] border-slate-700 mx-auto relative transform scale-95 lg:scale-100 transition-transform">
                            {/* Notch */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-24 bg-slate-900 rounded-b-xl z-20"></div>

                            {/* Screen */}
                            <div className="bg-[#E2E5E8] h-[550px] rounded-[2rem] overflow-hidden flex flex-col relative w-full font-sans">
                                {/* WhatsApp Header */}
                                <div className="bg-[#008069] px-4 pt-8 pb-3 text-white flex items-center gap-3 shadow-sm z-10">
                                    <div className="h-9 w-9 rounded-full bg-slate-200/20 flex items-center justify-center">
                                        <Users className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-semibold text-sm leading-tight">Broadcast List</div>
                                        <div className="text-[10px] opacity-80 leading-tight truncate w-32">
                                            {contacts.length > 0 ? `${contacts.length} recipients` : 'tap for info'}
                                        </div>
                                    </div>
                                    <div className="flex gap-4 text-white/90">
                                        <div className="h-3.5 w-3.5 border-2 border-white/80 rounded-sm"></div>
                                        <div className="h-1 w-1 bg-white rounded-full box-content border-[3px] border-transparent"></div>
                                    </div>
                                </div>

                                {/* Chat Bg */}
                                <div className="flex-1 p-3 overflow-y-auto bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg opacity-90 relative">
                                    <div className="flex justify-center my-4">
                                        <span className="bg-[#e2f1fb] text-[10px] text-slate-600 font-medium px-2.5 py-1 rounded-lg shadow-sm">
                                            HARI INI
                                        </span>
                                    </div>

                                    {message ? (
                                        <div className="bg-white rounded-tr-none rounded-lg p-2.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] ml-auto relative break-words animate-in slide-in-from-right-2 duration-300">
                                            <p className="text-[13.5px] text-[#111b21] leading-[19px] whitespace-pre-wrap">
                                                {message.replace(/\{([^{}]+)\}/g, (match, content) => content.split('|')[0])}
                                            </p>
                                            <div className="flex justify-end items-center gap-1 mt-1 opacity-60">
                                                <span className="text-[10px] text-slate-500">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                <CheckCircle2 className="h-2.5 w-2.5 text-[#53bdeb]" />
                                            </div>
                                            {/* Tail */}
                                            <div className="absolute top-0 -right-2 w-0 h-0 border-t-[0px] border-r-[10px] border-b-[10px] border-l-[0px] border-l-transparent border-r-transparent border-b-transparent border-t-white transform rotate-0"
                                                style={{
                                                    filter: 'drop-shadow(1px 0px 0px rgba(0,0,0,0.05))',
                                                    clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                                                    background: 'white',
                                                    width: '12px',
                                                    height: '12px',
                                                    zIndex: 10
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex h-full items-center justify-center opacity-40">
                                            <div className="text-center">
                                                <div className="bg-slate-200 h-16 w-32 rounded-lg mb-2 mx-auto"></div>
                                                <div className="text-[10px] font-medium text-slate-500">Pratinjau Pesan</div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input Bar Mockup */}
                                <div className="bg-[#f0f2f5] p-2 flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-slate-400">
                                        <div className="h-4 w-4 border-2 border-current rounded-full"></div>
                                    </div>
                                    <div className="flex-1 h-9 bg-white rounded-lg"></div>
                                    <div className="h-9 w-9 rounded-full bg-[#008069] flex items-center justify-center">
                                        <div className="h-0 w-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-white ml-0.5"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Save as Template Dialog */}
            <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle>Simpan sebagai Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="tpl-title">Nama Template</Label>
                            <Input
                                id="tpl-title"
                                placeholder="Contoh: Follow Up Leads"
                                value={templateTitle}
                                onChange={(e) => setTemplateTitle(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Preview Isi Pesan</Label>
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                                {message || '-'}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Batal</Button>
                        <Button
                            onClick={handleSaveAsTemplate}
                            disabled={!templateTitle.trim() || savingTemplate}
                            className="bg-blue-600 text-white hover:bg-blue-700"
                        >
                            {savingTemplate ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Menyimpan...</>
                            ) : (
                                <><Save className="h-4 w-4 mr-2" /> Simpan Template</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
