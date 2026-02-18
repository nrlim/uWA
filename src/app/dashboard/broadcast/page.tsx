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
    Smartphone,
    Upload,
    Users,
    Zap,
    CheckCircle2,
    ChevronRight,
    FileText,
    type LucideIcon,
    Variable,
    Save,
    Layout
} from "lucide-react"
import { useRouter } from "next/navigation"

export default function BroadcastPage() {
    const { activeBroadcast, isLoading: isStatusLoading } = useStatus()
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

    // Template State
    const [templates, setTemplates] = useState<{ id: string; title: string; content: string }[]>([])
    const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
    const [templateTitle, setTemplateTitle] = useState("")
    const [savingTemplate, setSavingTemplate] = useState(false)

    // For auto-scrolling preview
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Only scroll to bottom on initial load or if the user is near the bottom (optional)
    // Removed automatic scroll on typing to prevent layout shifts
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

    // Handle Smart Tag Insert
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

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <div className="pb-6 border-b border-slate-100">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Broadcast Baru</h1>
                <p className="text-slate-500 text-sm mt-1">Konfigurasi pesan dan target audiens kampanye Anda.</p>
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

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* LEFT COLUMN: Input Configuration (3 cols) */}
                <div className="lg:col-span-3 space-y-6">

                    {/* Campaign Info */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-4">
                            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-slate-500" />
                                Detail Kampanye
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Nama Kampanye</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="h-11 border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                                    placeholder="Contoh: Promo Ramadhan 2026"
                                    disabled={isLocked}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Message Content */}
                    <Card className="border border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50/50 pb-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                <Smartphone className="h-4 w-4 text-slate-500" />
                                Konten Pesan
                            </CardTitle>
                            <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-[10px] font-bold px-2 py-0.5">
                                SPINTAX SUPPORTED
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-0">
                            {/* Template Selector */}
                            {templates.length > 0 && (
                                <div className="px-6 pt-4 pb-2 border-b border-slate-100 bg-slate-50/30">
                                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                                        <Layout className="h-3 w-3 inline mr-1 -mt-0.5" />
                                        Gunakan Template
                                    </Label>
                                    <select
                                        className="w-full text-sm border border-slate-200 rounded-lg h-9 px-3 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors appearance-none cursor-pointer"
                                        onChange={(e) => {
                                            const t = templates.find(t => t.id === e.target.value)
                                            if (t) setMessage(t.content)
                                        }}
                                        defaultValue=""
                                        disabled={isLocked}
                                    >
                                        <option value="" disabled>-- Pilih dari Template --</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.title}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <Textarea
                                placeholder="Halo {Nama}, kami memiliki penawaran {spesial|eksklusif} untuk Anda..."
                                className="min-h-[250px] border-0 focus-visible:ring-0 resize-none p-6 text-base leading-relaxed text-slate-700 selection:bg-blue-100"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                disabled={isLocked}
                            />

                            {/* Smart Tags + Save as Template Toolbar */}
                            <div className="bg-slate-50/80 border-t border-slate-100 px-6 py-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-x-auto">
                                    <span className="text-xs font-semibold text-slate-400 mr-2 shrink-0">Smart Tags:</span>
                                    <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-slate-600 border-slate-200 hover:text-blue-600 hover:border-blue-200" onClick={() => insertTag("{Nama}")}>
                                        <Variable className="h-3 w-3 mr-1" /> Nama
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-slate-600 border-slate-200 hover:text-blue-600 hover:border-blue-200" onClick={() => insertTag("{Var1}")}>
                                        <Variable className="h-3 w-3 mr-1" /> Var 1
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-slate-600 border-slate-200 hover:text-blue-600 hover:border-blue-200" onClick={() => insertTag("{Tanggal}")}>
                                        <Variable className="h-3 w-3 mr-1" /> Tanggal
                                    </Button>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[11px] text-slate-400 hover:text-blue-600 shrink-0"
                                    onClick={() => { setTemplateTitle(""); setSaveTemplateOpen(true) }}
                                    disabled={!message || isLocked}
                                >
                                    <Save className="h-3 w-3 mr-1" /> Simpan sebagai Template
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Audience Section */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-4">
                            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-500" />
                                Target Audiens
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100 h-10 p-1">
                                    <TabsTrigger value="manual" className="text-xs font-medium">Input Manual</TabsTrigger>
                                    <TabsTrigger value="upload" className="text-xs font-medium">Upload File</TabsTrigger>
                                </TabsList>

                                <TabsContent value="manual" className="mt-0 space-y-4">
                                    <Textarea
                                        placeholder="Tempel nomor telepon di sini (satu per baris)..."
                                        className="min-h-[150px] border-slate-200 font-mono text-sm leading-relaxed"
                                        onChange={(e) => {
                                            const text = e.target.value;
                                            const rawNumbers = text.match(/[\d\+\-\(\)\s]+/g) || [];
                                            const cleaned = rawNumbers.map(n => n.replace(/\D/g, "")).filter(n => n.length >= 10);
                                            setContacts(Array.from(new Set(cleaned)));
                                        }}
                                        disabled={isLocked}
                                    />
                                    <p className="text-xs text-slate-400 text-right">
                                        Mendukung format +62, 08, atau 62.
                                    </p>
                                </TabsContent>

                                <TabsContent value="upload" className="mt-0">
                                    <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-all cursor-pointer relative bg-slate-50/30">
                                        <Input
                                            type="file"
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                                            accept=".txt,.csv"
                                            onChange={handleFileUpload}
                                            disabled={isLocked}
                                        />
                                        <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100">
                                            <Upload className="h-5 w-5 text-slate-500" />
                                        </div>
                                        <p className="font-semibold text-slate-900 text-sm">
                                            {file ? file.name : "Klik atau lepas file di sini"}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">Format .csv atau .txt (Maks 10MB)</p>
                                    </div>
                                </TabsContent>
                            </Tabs>

                            {/* Counter */}
                            {contacts.length > 0 && (
                                <div className="flex items-center justify-between mt-6 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-white p-1.5 rounded-full shadow-sm">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                        </div>
                                        <span className="font-bold text-emerald-900 text-sm">{contacts.length} Kontak Valid</span>
                                    </div>
                                    <button onClick={() => { setContacts([]); setFile(null) }} className="text-[10px] font-bold text-emerald-600/70 hover:text-emerald-700 uppercase tracking-wide">
                                        Hapus List
                                    </button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT COLUMN: Preview & Config (2 cols) */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Smartphone Preview */}
                    <div className="sticky top-6">
                        <div className="bg-slate-800 rounded-[2.5rem] p-3 shadow-2xl border-[4px] border-slate-700 max-w-[320px] mx-auto relative">
                            {/* Notch & Sensors */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-24 bg-slate-900 rounded-b-xl z-20"></div>

                            {/* Screen */}
                            <div className="bg-[#E2E5E8] h-[520px] rounded-[2rem] overflow-hidden flex flex-col relative w-full">
                                {/* Header */}
                                <div className="bg-[#008069] px-4 pt-8 pb-3 text-white flex items-center gap-3 shadow-sm z-10">
                                    <div className="h-8 w-8 rounded-full bg-slate-200/20 flex items-center justify-center">
                                        <Users className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-semibold text-xs leading-tight">Broadcast List</div>
                                        <div className="text-[9px] opacity-80 leading-tight">tap for info</div>
                                    </div>
                                    <div className="flex gap-3 text-white/80">
                                        <div className="h-3 w-3 border border-white/80 rounded-sm"></div>
                                        <div className="h-3 w-3 bg-white/80 rounded-full"></div>
                                    </div>
                                </div>

                                {/* Chat Bg & Bubbles */}
                                <div className="flex-1 p-3 overflow-y-auto bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg opacity-90">
                                    <div className="flex justify-center my-3">
                                        <span className="bg-[#e1f3fb] text-[9px] text-slate-500 font-medium px-2 py-0.5 rounded shadow-sm">
                                            HARI INI
                                        </span>
                                    </div>

                                    {message ? (
                                        <div className="bg-white rounded-lg p-2.5 shadow-sm max-w-[90%] ml-auto relative break-words">
                                            <p className="text-[13px] text-slate-900 leading-snug whitespace-pre-wrap">
                                                {message.replace(/\{([^{}]+)\}/g, (match, content) => content.split('|')[0])}
                                            </p>
                                            <div className="flex justify-end items-center gap-1 mt-1 opacity-50">
                                                <span className="text-[9px]">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                <CheckCircle2 className="h-2.5 w-2.5 text-blue-500" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center">
                                            <div className="bg-black/5 text-slate-500 text-[10px] px-3 py-1 rounded-full text-center max-w-[80%]">
                                                Pratinjau pesan Anda akan muncul di sini secara real-time.
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>
                        </div>

                        {/* Configuration Card */}
                        <Card className="mt-6 border-slate-200 shadow-lg bg-white relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Jeda Pesan (Detik)</Label>
                                    <div className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded">
                                        SAFETY MODE
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <Input
                                        type="number"
                                        value={delayMin}
                                        onChange={(e) => setDelayMin(Number(e.target.value))}
                                        className="text-center font-bold text-slate-900 h-10 border-slate-200 bg-slate-50"
                                    />
                                    <span className="text-slate-400 font-medium">-</span>
                                    <Input
                                        type="number"
                                        value={delayMax}
                                        onChange={(e) => setDelayMax(Number(e.target.value))}
                                        className="text-center font-bold text-slate-900 h-10 border-slate-200 bg-slate-50"
                                    />
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Target Penerima</span>
                                        <span className="font-medium text-slate-900">{contacts.length} Kontak</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Estimasi Waktu</span>
                                        <span className="font-medium text-slate-900">~{estimatedTime} Menit</span>
                                    </div>
                                </div>

                                <Button
                                    className="w-full h-12 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/10 transition-all rounded-lg"
                                    onClick={handleSubmit}
                                    disabled={isLocked || isSubmitting || !contacts.length || !message}
                                >
                                    {isSubmitting ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Memproses...</>
                                    ) : (
                                        <><Play className="h-4 w-4 mr-2" /> Kirim Broadcast</>
                                    )}
                                </Button>

                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-lg text-xs font-medium">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        {error}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
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
