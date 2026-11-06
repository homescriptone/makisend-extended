import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SessionGuard } from "@/components/session-guard"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Item,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeftIcon, LoaderIcon, PlusIcon, TrashIcon, UploadIcon, UsersIcon } from "lucide-react"
import { fetchApi } from "@/lib/api"
import { useTranslation } from "@/i18n"

interface AudienceList {
  id: string
  name: string
  description: string | null
  contactCount: number
  createdAt: string
  updatedAt: string
}

interface Contact {
  id: string
  email: string
  name: string | null
  variables: Record<string, string> | null
  createdAt: string
}

type ParsedRow = { email: string; name: string | null; variables: Record<string, string> | null }

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  const input = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      field = ""
      if (row.some((cell) => cell.trim() !== "")) rows.push(row)
      row = []
    } else if (ch !== "\r") {
      field += ch
    }
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== "")) rows.push(row)
  if (rows.length === 0) return { headers: [], rows: [] }
  const headers = rows[0].map((h) => h.trim())
  const data = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (header) record[header] = (cells[index] ?? "").trim()
    })
    return record
  })
  return { headers, rows: data }
}

function rowsToContacts(headers: string[], rows: Record<string, string>[]): { emailColumn: string | null; contacts: ParsedRow[] } {
  const emailColumn = headers.find((h) => h.toLowerCase() === "email") ?? headers.find((h) => /email/i.test(h)) ?? null
  if (!emailColumn) return { emailColumn: null, contacts: [] }
  const nameColumn = headers.find((h) => ["name", "full name", "fullname", "nom"].includes(h.toLowerCase())) ?? null
  const contacts = rows
    .map((row) => {
      const email = (row[emailColumn] ?? "").trim().toLowerCase()
      if (!email) return null
      const name = nameColumn ? (row[nameColumn] ?? "").trim() || null : null
      const variables: Record<string, string> = {}
      for (const [key, value] of Object.entries(row)) {
        if (key === emailColumn || key === nameColumn || !value) continue
        variables[key] = value
      }
      return { email, name, variables: Object.keys(variables).length ? variables : null }
    })
    .filter((row): row is ParsedRow => row !== null)
  return { emailColumn, contacts }
}

export function ListsLayout() {
  const { t, locale } = useTranslation()
  const [lists, setLists] = useState<AudienceList[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AudienceList | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsed, setParsed] = useState<{ emailColumn: string | null; contacts: ParsedRow[] } | null>(null)

  const fmtDate = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))

  const loadLists = async () => {
    try {
      const res = await fetchApi("/audiences")
      const data = await res.json()
      setLists(data.lists ?? [])
    } catch {
      toast.error(t("lists.toast.loadFailed"))
    } finally {
      setLoading(false)
    }
  }

  const loadContacts = async (listId: string) => {
    setContactsLoading(true)
    try {
      const res = await fetchApi(`/audiences/${listId}/contacts`)
      const data = await res.json()
      setContacts(data.contacts ?? [])
    } catch {
      toast.error(t("lists.toast.loadFailed"))
    } finally {
      setContactsLoading(false)
    }
  }

  useEffect(() => {
    loadLists()
  }, [])

  const openList = async (list: AudienceList) => {
    setSelected(list)
    await loadContacts(list.id)
  }

  const createList = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetchApi("/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      })
      if (!res.ok) throw new Error("create failed")
      const data = await res.json()
      setLists((prev) => [{ ...data.list, contactCount: 0 }, ...prev])
      setCreateOpen(false)
      setName("")
      setDescription("")
      toast.success(t("lists.toast.created"))
    } catch {
      toast.error(t("lists.toast.createFailed"))
    } finally {
      setSaving(false)
    }
  }

  const deleteList = async (list: AudienceList) => {
    if (!window.confirm(t("lists.deleteConfirm"))) return
    try {
      const res = await fetchApi(`/audiences/${list.id}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) throw new Error("delete failed")
      setLists((prev) => prev.filter((item) => item.id !== list.id))
      if (selected?.id === list.id) {
        setSelected(null)
        setContacts([])
      }
    } catch {
      toast.error(t("lists.toast.deleteFailed"))
    }
  }

  const deleteContact = async (contactId: string) => {
    if (!selected) return
    try {
      const res = await fetchApi(`/audiences/${selected.id}/contacts/${contactId}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) throw new Error("delete failed")
      setContacts((prev) => prev.filter((item) => item.id !== contactId))
      const nextCount = Math.max(0, (selected.contactCount ?? 1) - 1)
      const updated = { ...selected, contactCount: nextCount }
      setSelected(updated)
      setLists((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      toast.success(t("lists.toast.contactDeleted"))
    } catch {
      toast.error(t("lists.toast.deleteFailed"))
    }
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    const csv = parseCsv(text)
    setParsed(rowsToContacts(csv.headers, csv.rows))
  }

  const runImport = async () => {
    if (!selected || !parsed?.contacts.length) return
    setImporting(true)
    try {
      const res = await fetchApi(`/audiences/${selected.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: parsed.contacts }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error("import failed")
      toast.success(t("lists.importResult", { imported: data.imported ?? 0, skipped: data.skipped ?? 0 }))
      setImportOpen(false)
      setParsed(null)
      await loadContacts(selected.id)
      await loadLists()
      const refreshed = (await (await fetchApi(`/audiences/${selected.id}`)).json().catch(() => null))?.list
      if (refreshed) setSelected((prev) => (prev ? { ...prev, ...refreshed, contactCount: refreshed.contactCount ?? prev.contactCount } : prev))
    } catch {
      toast.error(t("lists.toast.importFailed"))
    } finally {
      setImporting(false)
    }
  }

  return (
    <SessionGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <SiteHeader titleKey="nav.lists" />
          <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            {selected ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setSelected(null)} aria-label={t("lists.back")}>
                      <ArrowLeftIcon className="size-4" />
                    </Button>
                    <div>
                      <h2 className="text-lg font-medium">{selected.name}</h2>
                      <p className="text-sm text-muted-foreground">{t("lists.contacts", { count: selected.contactCount })}</p>
                    </div>
                  </div>
                  <Button className="h-11" onClick={() => { setParsed(null); setImportOpen(true) }}>
                    <UploadIcon className="size-4" />
                    {t("lists.import")}
                  </Button>
                </div>

                {contactsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderIcon className="size-4 animate-spin" />{t("common.loading")}</div>
                ) : contacts.length === 0 ? (
                  <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">{t("lists.contactsEmpty")}</div>
                ) : (
                  <div className="rounded-2xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("lists.tableEmail")}</TableHead>
                          <TableHead>{t("lists.tableName")}</TableHead>
                          <TableHead>{t("lists.tableAdded")}</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contacts.map((contact) => (
                          <TableRow key={contact.id}>
                            <TableCell>{contact.email}</TableCell>
                            <TableCell>{contact.name ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{fmtDate(contact.createdAt)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => deleteContact(contact.id)} aria-label={t("lists.delete")}>
                                <TrashIcon className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-medium">{t("lists.title")}</h2>
                    <p className="text-sm text-muted-foreground">{t("lists.description")}</p>
                  </div>
                  <Button className="h-11" onClick={() => setCreateOpen(true)}>
                    <PlusIcon className="size-4" />
                    {t("lists.create")}
                  </Button>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderIcon className="size-4 animate-spin" />{t("common.loading")}</div>
                ) : lists.length === 0 ? (
                  <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
                    <UsersIcon className="mx-auto mb-3 size-5 text-muted-foreground" />
                    {t("lists.empty")}
                  </div>
                ) : (
                  <ItemGroup className="gap-2">
                    {lists.map((list) => (
                      <Item key={list.id} variant="outline" className="rounded-2xl">
                        <ItemContent>
                          <ItemTitle>{list.name}</ItemTitle>
                          <ItemDescription>{list.description ? `${list.description} · ` : ""}{t("lists.contacts", { count: list.contactCount })}</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Button variant="outline" className="h-11" onClick={() => openList(list)}>{t("lists.open")}</Button>
                          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => deleteList(list)} aria-label={t("lists.delete")}>
                            <TrashIcon className="size-4" />
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{t("lists.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="list-name">{t("lists.name")}</Label>
              <Input id="list-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("lists.namePlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="list-desc">{t("lists.listDescription")}</Label>
              <Input id="list-desc" className="h-11" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("lists.descriptionPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setCreateOpen(false)}>{t("lists.cancel")}</Button>
            <Button className="h-11" onClick={createList} disabled={saving || !name.trim()}>
              {saving ? <LoaderIcon className="size-4 animate-spin" /> : null}
              {t("lists.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setParsed(null) }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t("lists.importTitle")}</DialogTitle>
            <DialogDescription>{t("lists.importHelp")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="list-csv">{t("lists.file")}</Label>
              <Input id="list-csv" type="file" accept=".csv,text/csv" className="h-11" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </div>
            {parsed ? (
              parsed.emailColumn ? (
                <p className="text-sm text-muted-foreground">
                  {t("lists.mappingEmail", { column: parsed.emailColumn })} · {t("lists.preview", { count: parsed.contacts.length })}
                </p>
              ) : (
                <p className="text-sm text-destructive">{t("lists.mappingNone")}</p>
              )
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setImportOpen(false)}>{t("lists.cancel")}</Button>
            <Button className="h-11" onClick={runImport} disabled={importing || !parsed?.contacts.length}>
              {importing ? <LoaderIcon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
              {importing ? t("lists.importing") : t("lists.importAction", { count: parsed?.contacts.length ?? 0 })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </SessionGuard>
  )
}
