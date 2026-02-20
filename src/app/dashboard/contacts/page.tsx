"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Search, Upload, Trash2, CheckCircle2, XCircle, Clock, FileText, Download, Edit } from "lucide-react"

import Papa from "papaparse"
import * as XLSX from "xlsx"

type Contact = {
    id: string;
    phone: string;
    name: string | null;
    status: string;
    tags: string | null;
    createdAt: string;
}

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")

    // Upload state
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [isUploading, setIsUploading] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Edit state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [editingContact, setEditingContact] = useState<Contact | null>(null)
    const [editForm, setEditForm] = useState({ name: "", phone: "", tags: "" })

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const fetchContacts = async () => {
        setLoading(true)
        try {
            const url = new URL("/api/contacts", window.location.origin)
            if (search) url.searchParams.set("search", search)
            const res = await fetch(url.toString())
            if (res.ok) {
                const data = await res.json()
                setContacts(data)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchContacts()
    }, [search])

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(contacts.map(c => c.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const openEditModal = (contact: Contact) => {
        setEditingContact(contact)
        setEditForm({ name: contact.name || "", phone: contact.phone || "", tags: contact.tags || "" })
        setIsEditModalOpen(true)
    }

    const saveEdit = async () => {
        if (!editingContact) return
        setIsSaving(true)
        try {
            const res = await fetch("/api/contacts", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editingContact.id, ...editForm })
            })
            if (res.ok) {
                setIsEditModalOpen(false)
                fetchContacts()
            } else {
                const data = await res.json()
                alert(`Gagal menyimpan: ${data.error}`)
            }
        } catch (e) {
            console.error(e)
            alert("Terjadi kesalahan saat menyimpan")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm(`Hapus ${selectedIds.size} kontak terpilih?`)) return

        try {
            const res = await fetch("/api/contacts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            })
            if (res.ok) {
                setSelectedIds(new Set())
                fetchContacts()
            }
        } catch (e) {
            console.error(e)
        }
    }

    const processUpload = async () => {
        if (!selectedFile) return
        setIsUploading(true)
        setUploadProgress(0)

        try {
            let parsedContacts: any[] = []

            if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.txt')) {
                // Parse CSV or TXT using PapaParse in browser (handles large files safely by breaking lines)
                const text = await selectedFile.text()
                const result = Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                })

                parsedContacts = result.data.map((row: any) => ({
                    phone: row.phone || row.Phone || row.nomor || row.Nomor || (Object.values(row)[0] as string),
                    name: row.name || row.Name || row.nama || row.Nama || null,
                    tags: row.tags || row.Tags || null
                }))
            } else if (selectedFile.name.endsWith('.xlsx')) {
                const buffer = await selectedFile.arrayBuffer()
                const workbook = XLSX.read(buffer, { type: 'array' })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                const json = XLSX.utils.sheet_to_json(worksheet)

                parsedContacts = json.map((row: any) => ({
                    phone: row.phone || row.Phone || row.nomor || row.Nomor || (Object.values(row)[0] as string),
                    name: row.name || row.Name || row.nama || row.Nama || null,
                    tags: row.tags || row.Tags || null
                }))
            }

            // Chunk and send to API avoiding VPS OOM
            const chunkSize = 500
            const totalChunks = Math.ceil(parsedContacts.length / chunkSize)

            let totalImported = 0

            for (let i = 0; i < totalChunks; i++) {
                const chunk = parsedContacts.slice(i * chunkSize, (i + 1) * chunkSize)

                const res = await fetch("/api/contacts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contacts: chunk })
                })

                if (res.ok) {
                    const data = await res.json()
                    totalImported += data.imported || 0
                }

                setUploadProgress(Math.floor(((i + 1) / totalChunks) * 100))
            }

            setIsUploadModalOpen(false)
            setSelectedFile(null)
            fetchContacts()
            alert(`Berhasil mengimpor ${totalImported} kontak baru. Sisanya duplikat atau tidak valid.`)

        } catch (error) {
            console.error("Upload error", error)
            alert("Gagal memproses file upload.")
        } finally {
            setIsUploading(false)
            setUploadProgress(0)
        }
    }

    const downloadTemplate = (format: 'xlsx' | 'csv' | 'txt') => {
        const data = [
            { phone: '628123456789', name: 'Budi Darmawan' }
        ];

        if (format === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
            XLSX.writeFile(workbook, "uWA_Contact_Template.xlsx");
        } else if (format === 'csv') {
            const csv = Papa.unparse(data);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", "uWA_Contact_Template.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (format === 'txt') {
            const txt = `phone|name\n628123456789|Budi Darmawan`;
            const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", "uWA_Contact_Template.txt");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    const StatusBadge = ({ status }: { status: string }) => {
        switch (status) {
            case 'VERIFIED': return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Verified</Badge> // Verified
            case 'INVALID': return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20"><XCircle className="w-3 h-3 mr-1" /> Invalid</Badge> // Invalid
            default: return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"><Clock className="w-3 h-3 mr-1" /> Pending</Badge> // Pending
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-800">Manajemen Kontak</h1>
                    <p className="text-slate-500 mt-1 text-sm">Upload dan verifikasi nomor WhatsApp otomatis.</p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full sm:w-auto gap-2 text-slate-700">
                                <Download className="w-4 h-4" /> Download Template
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => downloadTemplate('xlsx')}>
                                <FileText className="mr-2 h-4 w-4" /> Excel (.xlsx)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadTemplate('csv')}>
                                <FileText className="mr-2 h-4 w-4" /> CSV (.csv)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadTemplate('txt')}>
                                <FileText className="mr-2 h-4 w-4" /> TXT (.txt)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button onClick={() => setIsUploadModalOpen(true)} className="w-full sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                        <Upload className="w-4 h-4" /> Bulk Upload
                    </Button>
                </div>
            </div>

            <Card className="border-slate-200">
                <CardHeader className="pb-3 border-b border-slate-100 bg-white rounded-t-xl flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-medium text-slate-700">Database Kontak</CardTitle>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                type="search"
                                placeholder="Cari nama, nomor, tag..."
                                className="pl-9 w-64 text-sm bg-slate-50 border-slate-200"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        {selectedIds.size > 0 && (
                            <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-2">
                                <Trash2 className="w-4 h-4" /> Hapus ({selectedIds.size})
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-12 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={contacts.length > 0 && selectedIds.size === contacts.length}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                    />
                                </TableHead>
                                <TableHead>No. WhatsApp</TableHead>
                                <TableHead>Nama</TableHead>
                                <TableHead>Tags</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-slate-500">Memuat kontak...</TableCell>
                                </TableRow>
                            ) : contacts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                                        Belum ada kontak. Silahkan upload file XLSX/CSV.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                contacts.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="text-center text-slate-400">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300"
                                                checked={selectedIds.has(c.id)}
                                                onChange={() => toggleSelect(c.id)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium text-slate-700">{c.phone}</TableCell>
                                        <TableCell className="text-slate-500">{c.name || "-"}</TableCell>
                                        <TableCell className="text-slate-500">{c.tags || "-"}</TableCell>
                                        <TableCell><StatusBadge status={c.status} /></TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => openEditModal(c)}>
                                                <Edit className="w-4 h-4 text-slate-500 hover:text-blue-600" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Upload Modal */}
            <Dialog open={isUploadModalOpen} onOpenChange={(open) => !isUploading && setIsUploadModalOpen(open)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Import Kontak</DialogTitle>
                        <DialogDescription>
                            Upload file Excel (.xlsx), CSV (.csv), atau Teks (.txt). Nomor yang belum terdaftar di database akan masuk ke antrean verifikasi otomatis.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="file-upload">Pilih File</Label>
                            <Input
                                id="file-upload"
                                type="file"
                                accept=".csv,.xlsx,.txt"
                                ref={fileInputRef}
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                disabled={isUploading}
                            />
                        </div>

                        {selectedFile && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                <FileText className="w-4 h-4" />
                                <span className="flex-1 truncate">{selectedFile.name}</span>
                                <span className="text-slate-400 text-xs">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                            </div>
                        )}

                        {isUploading && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>Memproses...</span>
                                    <span>{uploadProgress}%</span>
                                </div>
                                <Progress value={uploadProgress} className="h-2" />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => !isUploading && setIsUploadModalOpen(false)} disabled={isUploading}>
                            Batal
                        </Button>
                        <Button onClick={processUpload} disabled={!selectedFile || isUploading} className="bg-blue-600 hover:bg-blue-700">
                            {isUploading ? "Mengirim..." : "Upload & Mulai Verifikasi"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog open={isEditModalOpen} onOpenChange={(open) => !isSaving && setIsEditModalOpen(open)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Kontak</DialogTitle>
                        <DialogDescription>
                            Perbarui informasi kontak di bawah ini.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Nama</Label>
                            <Input
                                id="edit-name"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                placeholder="Nama kontak"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-phone">No. WhatsApp</Label>
                            <Input
                                id="edit-phone"
                                value={editForm.phone}
                                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                placeholder="628xxx"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-tags">Tags</Label>
                            <Input
                                id="edit-tags"
                                value={editForm.tags}
                                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                                placeholder="Tag 1, Tag 2"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => !isSaving && setIsEditModalOpen(false)} disabled={isSaving}>
                            Batal
                        </Button>
                        <Button onClick={saveEdit} disabled={isSaving || !editForm.phone} className="bg-blue-600 hover:bg-blue-700">
                            {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
