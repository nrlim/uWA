"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    FileText,
    Plus,
    Trash2,
    Edit,
    Save,
    MoreHorizontal,
    Eye,
    Loader2,
    FileBox
} from "lucide-react"

interface Template {
    id: string
    title: string
    content: string
    createdAt: string
}

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<Template[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [currentTemplate, setCurrentTemplate] = useState<Partial<Template>>({})
    const [isSaving, setIsSaving] = useState(false)

    // Preview Dialog
    const [previewOpen, setPreviewOpen] = useState(false)
    const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)

    useEffect(() => {
        fetchTemplates()
    }, [])

    const fetchTemplates = async () => {
        setIsLoading(true)
        try {
            const res = await fetch('/api/templates')
            if (res.ok) {
                const data = await res.json()
                setTemplates(data)
            }
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSave = async () => {
        if (!currentTemplate.title || !currentTemplate.content) return
        setIsSaving(true)

        try {
            const url = isEditing ? `/api/templates/${currentTemplate.id}` : '/api/templates'
            const method = isEditing ? 'PUT' : 'POST'

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentTemplate)
            })

            if (res.ok) {
                setIsOpen(false)
                setCurrentTemplate({})
                setIsEditing(false)
                fetchTemplates()
            }
        } catch (error) {
            console.error(error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Apakah Anda yakin ingin menghapus template ini?')) return

        try {
            const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
            if (res.ok) {
                fetchTemplates()
            }
        } catch (error) {
            console.error(error)
        }
    }

    const openEdit = (template: Template) => {
        setCurrentTemplate(template)
        setIsEditing(true)
        setIsOpen(true)
    }

    const openNew = () => {
        setCurrentTemplate({})
        setIsEditing(false)
        setIsOpen(true)
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="h-8 w-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                <p className="text-slate-500 text-sm font-medium animate-pulse">Memuat template...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Template Pesan</h1>
                    <p className="text-slate-500 text-sm mt-1">Kelola template pesan broadcast untuk penggunaan berulang.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={openNew} className="h-9 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800">
                        <Plus className="h-3.5 w-3.5 mr-2" /> Buat Template
                    </Button>
                </div>
            </div>

            {/* Main Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[25%]">Nama Template</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[45%]">Isi Pesan (Preview)</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider w-[20%]">Dibuat</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 text-[11px] uppercase tracking-wider text-right w-[10%]">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {templates.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                                <FileBox className="h-6 w-6 text-slate-400" />
                                            </div>
                                            <p className="text-slate-900 font-medium">Belum ada template</p>
                                            <p className="text-slate-400 text-xs">Buat template pertama Anda untuk mempercepat pembuatan pesan broadcast.</p>
                                            <Button onClick={openNew} variant="outline" size="sm" className="mt-2 h-8 text-xs font-medium border-slate-200 text-slate-600">
                                                <Plus className="h-3 w-3 mr-1.5" /> Buat Template Baru
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                templates.map((template) => (
                                    <tr key={template.id} className="group hover:bg-slate-50/50 transition-colors">
                                        {/* Template Name */}
                                        <td className="px-6 py-4 align-top">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-semibold text-slate-900 text-sm group-hover:text-blue-600 transition-colors cursor-pointer">
                                                    {template.title}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    ID: {template.id.substring(0, 8)}...
                                                </span>
                                            </div>
                                        </td>

                                        {/* Content Preview */}
                                        <td className="px-6 py-4 align-top">
                                            <p className="text-sm text-slate-600 truncate max-w-[400px] leading-relaxed">
                                                {template.content}
                                            </p>
                                            {template.content.includes('{') && (
                                                <Badge variant="secondary" className="mt-1.5 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide border shadow-none bg-blue-50 text-blue-600 border-blue-200">
                                                    SPINTAX
                                                </Badge>
                                            )}
                                        </td>

                                        {/* Date */}
                                        <td className="px-6 py-4 align-top">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-slate-700 text-sm font-medium">
                                                    {new Date(template.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span className="text-slate-400 text-xs">
                                                    {new Date(template.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                </span>
                                            </div>
                                        </td>

                                        {/* Actions */}
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
                                                    <DropdownMenuItem className="cursor-pointer" onClick={() => { setPreviewTemplate(template); setPreviewOpen(true) }}>
                                                        <Eye className="mr-2 h-4 w-4" /> Preview
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(template)}>
                                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => handleDelete(template.id)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Menampilkan {templates.length} template</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-slate-200 text-slate-600" disabled>Sebelumnya</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-white border-slate-200 text-slate-600" disabled>Selanjutnya</Button>
                    </div>
                </div>
            </div>

            {/* Create / Edit Dialog */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{isEditing ? 'Edit Template' : 'Buat Template Baru'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="tpl-title" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Nama Template</Label>
                            <Input
                                id="tpl-title"
                                placeholder="Contoh: Follow Up Leads"
                                value={currentTemplate.title || ''}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, title: e.target.value })}
                                className="h-11 border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tpl-content" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Isi Pesan</Label>
                            <Textarea
                                id="tpl-content"
                                placeholder={"Halo {Kak|Gan}, kami punya promo {spesial|menarik} untuk Anda..."}
                                className="min-h-[200px] font-mono text-sm leading-relaxed border-slate-200"
                                value={currentTemplate.content || ''}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, content: e.target.value })}
                            />
                            <p className="text-[11px] text-slate-400">
                                Gunakan format <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 text-[10px]">{'{opsi1|opsi2}'}</code> untuk variasi teks (Spintax). Nesting didukung.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)} className="border-slate-200 text-slate-600">Batal</Button>
                        <Button
                            onClick={handleSave}
                            disabled={!currentTemplate.title?.trim() || !currentTemplate.content?.trim() || isSaving}
                            className="bg-slate-900 text-white hover:bg-slate-800"
                        >
                            {isSaving ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Menyimpan...</>
                            ) : (
                                <><Save className="h-4 w-4 mr-2" /> Simpan Template</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                        <DialogTitle>{previewTemplate?.title || 'Preview Template'}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto font-mono">
                            {previewTemplate?.content || '-'}
                        </div>
                        {previewTemplate?.content?.includes('{') && (
                            <div className="mt-3 flex items-center gap-2">
                                <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide border shadow-none bg-blue-50 text-blue-600 border-blue-200">
                                    SPINTAX
                                </Badge>
                                <span className="text-[11px] text-slate-400">Template ini mengandung variasi teks otomatis.</span>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPreviewOpen(false)} className="border-slate-200 text-slate-600">Tutup</Button>
                        <Button
                            onClick={() => {
                                if (previewTemplate) openEdit(previewTemplate)
                                setPreviewOpen(false)
                            }}
                            className="bg-slate-900 text-white hover:bg-slate-800"
                        >
                            <Edit className="h-4 w-4 mr-2" /> Edit Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
