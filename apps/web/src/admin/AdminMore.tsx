import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, FileText, KeyRound, Link2, MessagesSquare, Pencil, Plus, Save, Search, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { formatUsd } from "@autofte/shared";
import { api, ApiError, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago, date } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table, Tabs, Textarea, clsx } from "../ui";
import { Denied, UploadButton, useFlash } from "./AdminPages";

const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

/* ========================= Content lists ========================= */
type Row = Record<string, unknown> & { id: string };
interface FieldDef {
  name: string;
  label: string;
  kind?: "text" | "area" | "number" | "select" | "check" | "image";
  rows?: number;
  options?: { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  nullable?: boolean;
  wide?: boolean;
}
interface Coll {
  key: string;
  label: string;
  one: string;
  blurb: string;
  fields: FieldDef[];
  title: (r: Row) => string;
  sub?: (r: Row) => string;
  badge?: (r: Row) => ReactNode;
  view?: (r: Row) => string | null;
}

const ORDER: FieldDef = { name: "sort", label: "Order", kind: "number", hint: "lower shows first" };

const COLLS: Coll[] = [
  {
    key: "blog",
    label: "Guides",
    one: "guide",
    blurb: "Articles on the Guides page. A draft stays private, even by its direct link.",
    fields: [
      { name: "title", label: "Title", required: true, wide: true },
      { name: "slug", label: "Path", hint: "leave empty to make it from the title" },
      { name: "coverUrl", label: "Cover image", kind: "image", nullable: true },
      { name: "excerpt", label: "Short summary", kind: "area", rows: 2, wide: true },
      { name: "body", label: "Article", kind: "area", rows: 12, hint: "Markdown supported", wide: true },
      { name: "seoTitle", label: "SEO title", nullable: true },
      { name: "seoDescription", label: "SEO description", nullable: true },
      { name: "published", label: "Published", kind: "check" },
    ],
    title: (r) => String(r.title),
    sub: (r) => `/${String(r.slug)}${r.publishedAt ? ` · ${date(String(r.publishedAt))}` : ""}`,
    badge: (r) => (r.publishedAt ? <Badge tone="green">Published</Badge> : <Badge tone="gray">Draft</Badge>),
    view: (r) => (r.publishedAt ? `/blog/${String(r.slug)}` : null),
  },
  {
    key: "services",
    label: "Services",
    one: "service",
    blurb: "The cards on the Services page.",
    fields: [
      { name: "title", label: "Title", required: true },
      {
        name: "icon",
        label: "Icon",
        kind: "select",
        nullable: true,
        options: [
          { value: "", label: "None" },
          ...["Gavel", "Car", "ClipboardCheck", "Ship", "FileText", "Headphones"].map((v) => ({ value: v, label: v })),
        ],
      },
      { name: "body", label: "Text", kind: "area", rows: 4, required: true, wide: true },
      ORDER,
    ],
    title: (r) => String(r.title),
    sub: (r) => String(r.body).slice(0, 90),
    view: () => "/services",
  },
  {
    key: "faqs",
    label: "FAQ",
    one: "question",
    blurb: "Questions on the FAQ page. The AI employee answers from them too.",
    fields: [
      { name: "question", label: "Question", required: true, wide: true },
      { name: "answer", label: "Answer", kind: "area", rows: 4, required: true, wide: true },
      { name: "category", label: "Category", hint: "e.g. Payment, Shipping" },
      ORDER,
    ],
    title: (r) => String(r.question),
    sub: (r) => String(r.category),
    view: () => "/faq",
  },
  {
    key: "testimonials",
    label: "Testimonials",
    one: "testimonial",
    blurb: "What buyers say, on the home page.",
    fields: [
      { name: "name", label: "Buyer's name", required: true },
      { name: "country", label: "Country", nullable: true },
      { name: "text", label: "What they said", kind: "area", rows: 3, required: true, wide: true },
      { name: "rating", label: "Stars", kind: "select", options: ["5", "4", "3", "2", "1"].map((v) => ({ value: v, label: `${v} stars` })) },
      { name: "videoUrl", label: "Video URL", nullable: true },
      ORDER,
    ],
    title: (r) => String(r.name),
    sub: (r) => `${r.country ? `${String(r.country)} · ` : ""}${"★".repeat(Number(r.rating) || 0)}`,
    view: () => "/",
  },
  {
    key: "partners",
    label: "Partners",
    one: "partner",
    blurb: "The Official Partners page.",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "url", label: "Website", nullable: true },
      { name: "logoUrl", label: "Logo", kind: "image", nullable: true },
      ORDER,
    ],
    title: (r) => String(r.name),
    sub: (r) => String(r.url ?? ""),
    view: () => "/partners",
  },
  {
    key: "locations",
    label: "Locations",
    one: "location",
    blurb: "The Our Locations page.",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "phone", label: "Phone", nullable: true },
      { name: "address", label: "Address", kind: "area", rows: 2, required: true, wide: true },
      { name: "email", label: "E-mail", nullable: true },
      { name: "mapUrl", label: "Map link", nullable: true },
      ORDER,
    ],
    title: (r) => String(r.name),
    sub: (r) => String(r.address),
    view: () => "/locations",
  },
];

export function AdminContent() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const [tab, setTab] = useState(COLLS[0]!.key);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const coll = COLLS.find((c) => c.key === tab)!;
  const q = useQuery({ queryKey: ["admin/content", tab], queryFn: () => api.get<Row[]>(`/api/admin/content/${tab}`), enabled: can("website.content.manage") });
  if (!can("website.content.manage")) return <Denied />;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin/content", tab] });
  const remove = async (r: Row) => {
    if (!confirm(`Delete "${coll.title(r)}"?`)) return;
    try {
      await api.del(`/api/admin/content/${tab}/${r.id}`);
      flash.ok("Deleted.");
      refresh();
    } catch (e) {
      flash.err(e);
    }
  };
  return (
    <div>
      <PageHeader title="Site content" subtitle="Everything here is live on the website as soon as you save it." actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New {coll.one}</Button>} />
      {flash.node}
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} items={COLLS.map((c) => ({ value: c.key, label: c.label }))} />
      </div>
      <p className="mb-3 text-sm text-slate-500">{coll.blurb}</p>
      {q.isLoading ? (
        <Skeleton className="h-60" />
      ) : !q.data?.length ? (
        <Empty icon={<FileText className="size-8" />} title={`No ${coll.label.toLowerCase()} yet`} action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New {coll.one}</Button>} />
      ) : (
        <div className="space-y-2">
          {q.data.map((r) => {
            const view = coll.view?.(r);
            return (
              <Card key={r.id} padded={false} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                  <p className="font-semibold text-slate-900 sm:truncate">{coll.title(r)}</p>
                  {coll.sub ? <p className="break-words text-xs text-slate-500 sm:truncate">{coll.sub(r)}</p> : null}
                </div>
                {coll.badge?.(r)}
                <div className="flex shrink-0 gap-1">
                  {view ? <a href={view} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="View on site"><ExternalLink className="size-4" /></a> : null}
                  <button onClick={() => setEditing(r)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil className="size-4" /></button>
                  <button onClick={() => void remove(r)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 className="size-4" /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && (
        <ContentForm
          key={editing === "new" ? "new" : editing.id}
          coll={coll}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            flash.ok("Saved — it is live on the site.");
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ContentForm({ coll, row, onClose, onSaved }: { coll: Coll; row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const d of coll.fields) {
      if (d.kind === "check") init[d.name] = row ? !!row.publishedAt : true;
      else init[d.name] = row && row[d.name] != null ? String(row[d.name]) : d.name === "sort" ? "0" : d.name === "rating" ? "5" : "";
    }
    return init;
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const body: Record<string, unknown> = {};
    for (const d of coll.fields) {
      const v = f[d.name];
      if (d.kind === "check") body[d.name] = !!v;
      else if (d.kind === "number" || d.name === "rating") body[d.name] = Number(v) || 0;
      else {
        const t = String(v).trim();
        if (d.required && !t) {
          setErr(`${d.label} is required`);
          return;
        }
        if (t) body[d.name] = t;
        else if (d.nullable) body[d.name] = null;
        else if (row && d.name !== "slug" && d.name !== "category") body[d.name] = ""; // a cleared optional text
      }
    }
    setSaving(true);
    setErr(null);
    try {
      if (row) await api.patch(`/api/admin/content/${coll.key}/${row.id}`, body);
      else await api.post(`/api/admin/content/${coll.key}`, body);
      onSaved();
    } catch (e) {
      setErr(message(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} wide title={row ? `Edit ${coll.one}` : `New ${coll.one}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={() => void save()}><Save className="size-4" /> Save</Button></>}>
      {err ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {coll.fields.map((d) =>
          d.kind === "check" ? (
            <label key={d.name} className="flex items-center gap-2 pt-1 text-sm font-medium text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={!!f[d.name]} onChange={(e) => setF({ ...f, [d.name]: e.target.checked })} className="size-4 rounded" /> {d.label}
            </label>
          ) : d.kind === "image" ? (
            <div key={d.name} className={d.wide ? "sm:col-span-2" : undefined}>
              <p className="mb-1 text-sm font-medium text-slate-700">{d.label}</p>
              <div className="flex flex-wrap items-center gap-2">
                {f[d.name] ? <img src={String(f[d.name])} alt="" className="size-10 rounded-lg object-cover ring-1 ring-slate-200" /> : null}
                <UploadButton onUploaded={(urls) => setF({ ...f, [d.name]: urls[0] ?? "" })} />
                {f[d.name] ? <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, [d.name]: "" })}>Remove</Button> : null}
              </div>
            </div>
          ) : (
            <Field key={d.name} label={d.label} hint={d.hint} className={d.wide ? "sm:col-span-2" : undefined}>
              {d.kind === "area" ? (
                <Textarea rows={d.rows ?? 3} value={String(f[d.name])} onChange={(e) => setF({ ...f, [d.name]: e.target.value })} />
              ) : d.kind === "select" ? (
                <Select value={String(f[d.name])} onChange={(e) => setF({ ...f, [d.name]: e.target.value })}>
                  {d.options!.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              ) : (
                <Input type={d.kind === "number" ? "number" : "text"} value={String(f[d.name])} onChange={(e) => setF({ ...f, [d.name]: e.target.value })} />
              )}
            </Field>
          ),
        )}
      </div>
    </Modal>
  );
}

/* ======================== Brands and models ======================== */
interface BrandRow {
  id: string;
  name: string;
  slug: string;
  sort: number;
  vehicles: number;
  models: { id: string; name: string; slug: string; vehicles: number }[];
}

export function AdminBrands() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const q = useQuery({ queryKey: ["admin/brands"], queryFn: () => api.get<BrandRow[]>("/api/admin/brands"), enabled: can("website.vehicles.manage") });
  const [newBrand, setNewBrand] = useState("");
  const [newModel, setNewModel] = useState<Record<string, string>>({});
  const [rename, setRename] = useState<{ kind: "brand" | "model"; id: string; name: string } | null>(null);
  if (!can("website.vehicles.manage")) return <Denied />;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin/brands"] });
    void qc.invalidateQueries({ queryKey: ["admin/meta"] }); // the vehicle form's brand and model lists
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      flash.ok(ok);
      refresh();
      return true;
    } catch (e) {
      flash.err(e);
      return false;
    }
  };
  return (
    <div className="max-w-4xl">
      <PageHeader title="Brands & models" subtitle="The makes and models buyers filter by and staff pick when adding a car." />
      {flash.node}
      <Card className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Add a brand" className="min-w-52 flex-1"><Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="e.g. Hino" /></Field>
        <Button disabled={newBrand.trim().length < 2} onClick={async () => { if (await run(() => api.post("/api/admin/brands", { name: newBrand.trim() }), `${newBrand.trim()} added.`)) setNewBrand(""); }}><Plus className="size-4" /> Add brand</Button>
      </Card>
      {q.isLoading ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="space-y-3">
          {q.data?.map((b) => (
            <Card key={b.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-bold text-slate-900">{b.name}</p>
                <Badge>{b.vehicles} car{b.vehicles === 1 ? "" : "s"}</Badge>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => setRename({ kind: "brand", id: b.id, name: b.name })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Rename brand"><Pencil className="size-4" /></button>
                  <button onClick={() => { if (confirm(`Delete brand ${b.name} and its models?`)) void run(() => api.del(`/api/admin/brands/${b.id}`), `${b.name} deleted.`); }} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete brand"><Trash2 className="size-4" /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {b.models.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-xs font-semibold text-slate-700">
                    <button onClick={() => setRename({ kind: "model", id: m.id, name: m.name })} className="hover:text-brand-700" title="Rename model">{m.name}</button>
                    <span className="font-normal text-slate-400">{m.vehicles}</span>
                    <button onClick={() => { if (confirm(`Delete model ${m.name}?`)) void run(() => api.del(`/api/admin/models/${m.id}`), `${m.name} deleted.`); }} className="rounded-full p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Delete model"><X className="size-3.5" /></button>
                  </span>
                ))}
                {!b.models.length && <span className="text-xs text-slate-400">No models yet</span>}
              </div>
              <div className="mt-3 flex gap-2">
                <Input className="max-w-xs" value={newModel[b.id] ?? ""} onChange={(e) => setNewModel({ ...newModel, [b.id]: e.target.value })} placeholder="Add a model" />
                <Button size="md" variant="secondary" disabled={!(newModel[b.id] ?? "").trim()} onClick={async () => { const name = newModel[b.id]!.trim(); if (await run(() => api.post(`/api/admin/brands/${b.id}/models`, { name }), `${name} added.`)) setNewModel({ ...newModel, [b.id]: "" }); }}><Plus className="size-4" /> Add</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {rename && (
        <Modal
          open
          onClose={() => setRename(null)}
          title={rename.kind === "brand" ? "Rename brand" : "Rename model"}
          footer={<><Button variant="secondary" onClick={() => setRename(null)}>Cancel</Button><Button disabled={!rename.name.trim()} onClick={async () => { const url = rename.kind === "brand" ? `/api/admin/brands/${rename.id}` : `/api/admin/models/${rename.id}`; if (await run(() => api.patch(url, { name: rename.name.trim() }), "Renamed.")) setRename(null); }}><Save className="size-4" /> Save</Button></>}
        >
          <Field label="Name" hint="Existing links on the site keep working after a rename."><Input autoFocus value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></Field>
        </Modal>
      )}
    </div>
  );
}

/* ============================ Customers ============================ */
interface CustomerRow {
  id: string;
  kind: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  countryCode: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  leads: number;
  orders: number;
}

function SecretBox({ title, value, note, onClose }: { title: string; value: string; note: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={title} footer={<Button onClick={onClose}><Check className="size-4" /> Done</Button>}>
      <p className="rounded-xl bg-amber-50 px-3 py-3 text-center font-mono text-lg font-bold tracking-wider text-amber-900 ring-1 ring-amber-100">{value}</p>
      <p className="mt-3 text-sm text-slate-600">{note}</p>
    </Modal>
  );
}

export function AdminCustomers() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const flash = useFlash();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ email: string; otp: string } | null>(null);
  const list = useQuery({
    queryKey: ["admin/customers", { q, kind, page }],
    queryFn: () => api.get<{ items: CustomerRow[]; total: number; page: number; pageSize: number }>("/api/admin/customers" + qs({ q, kind, page })),
    enabled: can("website.customers.view"),
  });
  if (!can("website.customers.view")) return <Denied />;
  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={can("website.customers.view_all") ? "Every buyer: website accounts and chat guests." : "The buyers whose CRM record is yours."}
        actions={can("website.customers.manage") ? <Button onClick={() => setCreating(true)}><UserPlus className="size-4" /> New customer</Button> : undefined}
      />
      {flash.node}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Name, e-mail, phone, company…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <Select className="max-w-[13rem]" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
          <option value="">Accounts & guests</option>
          <option value="customer">Website accounts</option>
          <option value="visitor">Chat guests</option>
        </Select>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-60" />
      ) : !list.data?.items.length ? (
        <Empty icon={<Users className="size-8" />} title="No customers match" />
      ) : (
        <>
          <Table head={["Customer", "Phone", "Country", "CRM records", "Orders", "Last seen", ""]}>
            {list.data.items.map((c) => (
              <tr key={c.id} onClick={() => nav(`/admin/customers/${c.id}`)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.email}{c.company ? ` · ${c.company}` : ""}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                <td className="px-4 py-3 text-slate-600">{c.countryCode ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.leads}</td>
                <td className="px-4 py-3 text-slate-600">{c.orders}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{c.lastSeenAt ? ago(c.lastSeenAt) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  {!c.isActive ? <Badge tone="red">Switched off</Badge> : c.kind === "visitor" ? <Badge tone="gray">Guest</Badge> : <Badge tone="green">Account</Badge>}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </>
      )}
      {creating && (
        <CustomerForm
          onClose={() => setCreating(false)}
          onCreated={(email, otp) => {
            setCreating(false);
            setSecret({ email, otp });
            void qc.invalidateQueries({ queryKey: ["admin/customers"] });
          }}
        />
      )}
      {secret && <SecretBox title="Account created" value={secret.otp} note={`Give this one-time password to the buyer (${secret.email}). It is shown once. They choose their own password at first sign-in.`} onClose={() => setSecret(null)} />}
    </div>
  );
}

function useCountries() {
  return useQuery({ queryKey: ["countries"], queryFn: () => api.get<{ code: string; name: string }[]>("/api/public/countries"), staleTime: 3600_000 });
}

function CustomerForm({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string, otp: string) => void }) {
  const countries = useCountries();
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", countryCode: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const r = await api.post<{ email: string; oneTimePassword: string }>("/api/admin/customers", { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), company: f.company.trim() || null, countryCode: f.countryCode || null });
      onCreated(r.email, r.oneTimePassword);
    } catch (e) {
      setErr(message(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New customer" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={f.name.trim().length < 2 || !f.email.includes("@") || f.phone.trim().length < 6} onClick={() => void save()}><UserPlus className="size-4" /> Create account</Button></>}>
      {err ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="E-mail" hint="This is their sign-in."><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone / WhatsApp"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Company (optional)"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="Country" className="sm:col-span-2">
          <Select value={f.countryCode} onChange={(e) => setF({ ...f, countryCode: e.target.value })}>
            <option value="">Choose…</option>
            {countries.data?.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

interface CustomerFull extends Omit<CustomerRow, "leads" | "orders"> {
  city: string | null;
  address: string | null;
  conversationId: string | null;
  leads: { id: string; customerName: string; status: string; phone: string; createdAt: string; linked: boolean; owner: string | null }[];
  invoices: { id: string; number: string; status: string; totalCnfUsd: number; paidUsd: number; createdAt: string; vehicles: { id: string; label: string; chassisNo: string | null; progress: { stage: string; date: string }[] }[] }[];
  orders: { id: string; orderNo: string; status: string; totalUsd: number; createdAt: string }[];
}

export function AdminCustomerDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const q = useQuery({ queryKey: ["admin/customer", id], queryFn: () => api.get<CustomerFull>(`/api/admin/customers/${id}`), enabled: can("website.customers.view") });
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [otp, setOtp] = useState<string | null>(null);
  if (!can("website.customers.view")) return <Denied />;
  const c = q.data;
  const manage = can("website.customers.manage");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin/customer", id] });
    void qc.invalidateQueries({ queryKey: ["admin/customers"] });
  };
  const toggleActive = async () => {
    if (!c) return;
    if (c.isActive && !confirm(`Switch off ${c.name}? They are signed out at once and cannot sign in.`)) return;
    try {
      await api.patch(`/api/admin/customers/${c.id}`, { isActive: !c.isActive });
      flash.ok(c.isActive ? "Switched off and signed out." : "Switched back on.");
      refresh();
    } catch (e) {
      flash.err(e);
    }
  };
  const resetPassword = async () => {
    if (!c || !confirm(`Issue a new one-time password for ${c.name}? Their old password stops working.`)) return;
    try {
      const r = await api.post<{ oneTimePassword: string }>(`/api/admin/customers/${c.id}/reset-password`);
      setOtp(r.oneTimePassword);
    } catch (e) {
      flash.err(e);
    }
  };
  if (q.isLoading) return <Skeleton className="h-80" />;
  if (!c) return <Empty title="Customer not found" text={q.error ? message(q.error) : undefined} action={<Link to="/admin/customers" className="font-semibold text-brand-700">Back to customers</Link>} />;
  return (
    <div className="max-w-5xl">
      <div className="mb-2"><Link to="/admin/customers" className="text-sm font-semibold text-brand-700">← Customers</Link></div>
      <PageHeader
        title={c.name}
        subtitle={[c.email, c.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            {c.conversationId && can("chat.desk") ? <Link to={`/desk?c=${c.conversationId}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"><MessagesSquare className="size-4" /> Open chat</Link> : null}
            {manage ? <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button> : null}
          </>
        }
      />
      {flash.node}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">CRM records</p>
              {manage ? <Button size="sm" variant="secondary" onClick={() => setLinking(true)}><Link2 className="size-4" /> Link a record</Button> : null}
            </div>
            {!c.leads.length ? (
              <p className="text-sm text-slate-500">No CRM record yet. Records with the same e-mail join automatically.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {c.leads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      {can("crm.access") ? <Link to={`/crm/leads/${l.id}`} className="inline-flex min-h-7 items-center font-medium text-brand-700 hover:underline">{l.customerName}</Link> : <span className="font-medium text-slate-800">{l.customerName}</span>}
                      <p className="text-xs text-slate-500">{l.owner ? `Owner: ${l.owner}` : "No owner"} · {date(l.createdAt)}{l.linked ? "" : " · matched by e-mail"}</p>
                    </div>
                    <span className="flex items-center gap-2">
                      {manage && !l.linked ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await api.post(`/api/admin/customers/${c.id}/link-lead`, { leadId: l.id });
                              flash.ok("Linked. The buyer now sees its invoices.");
                              refresh();
                            } catch (e) {
                              flash.err(e);
                            }
                          }}
                        >
                          <Link2 className="size-4" /> Link
                        </Button>
                      ) : null}
                      <StatusBadge status={l.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <p className="mb-3 font-semibold text-slate-900">Invoices & vehicle progress</p>
            {!c.invoices.length ? (
              <p className="text-sm text-slate-500">No invoices yet.</p>
            ) : (
              <div className="space-y-3">
                {c.invoices.map((inv) => (
                  <div key={inv.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {can("crm.access") ? <Link to={`/crm/invoices/${inv.id}`} className="font-semibold text-brand-700 hover:underline">{inv.number}</Link> : <span className="font-semibold text-slate-800">{inv.number}</span>}
                      <StatusBadge status={inv.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Total {formatUsd(Number(inv.totalCnfUsd))} · paid {formatUsd(inv.paidUsd)} · balance {formatUsd(Math.max(0, Number(inv.totalCnfUsd) - inv.paidUsd))}
                    </p>
                    {inv.vehicles.map((v) => (
                      <div key={v.id} className="mt-3">
                        <p className="text-sm font-medium text-slate-800">{v.label}{v.chassisNo ? <span className="font-normal text-slate-500"> · {v.chassisNo}</span> : null}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                          {v.progress.length ? (
                            v.progress.map((p, i) => (
                              <span key={i} className={clsx("rounded-full px-2 py-0.5 font-medium", i === v.progress.length - 1 ? "bg-brand-600 text-white" : "bg-emerald-50 text-emerald-700")} title={date(p.date)}>
                                {p.stage}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">Not started</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <p className="mb-3 font-semibold text-slate-900">Website orders</p>
            {!c.orders.length ? (
              <p className="text-sm text-slate-500">No order requests.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium text-slate-800">{o.orderNo}</p>
                      <p className="text-xs text-slate-500">{date(o.createdAt)} · {formatUsd(Number(o.totalUsd))}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <p className="mb-2 font-semibold text-slate-900">Account</p>
            <dl className="space-y-1.5 text-sm">
              <Row2 k="Type" v={c.kind === "visitor" ? "Chat guest" : "Website account"} />
              <Row2 k="Status" v={c.isActive ? "Active" : "Switched off"} />
              <Row2 k="Company" v={c.company} />
              <Row2 k="Country" v={c.countryCode} />
              <Row2 k="City" v={c.city} />
              <Row2 k="Address" v={c.address} />
              <Row2 k="Joined" v={date(c.createdAt)} />
              <Row2 k="Last seen" v={c.lastSeenAt ? ago(c.lastSeenAt) : "—"} />
            </dl>
          </Card>
          {manage ? (
            <Card className="space-y-2">
              <p className="font-semibold text-slate-900">Access</p>
              {c.kind === "customer" ? <Button variant="secondary" className="w-full" onClick={() => void resetPassword()}><KeyRound className="size-4" /> New one-time password</Button> : <p className="text-xs text-slate-500">A chat guest has no password. Use New customer with the same e-mail to give them an account; they keep this conversation.</p>}
              <Button variant={c.isActive ? "danger" : "success"} className="w-full" onClick={() => void toggleActive()}>{c.isActive ? "Switch off" : "Switch back on"}</Button>
            </Card>
          ) : null}
        </div>
      </div>
      {editing && <CustomerEdit c={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); flash.ok("Saved."); refresh(); }} />}
      {linking && <LinkLead customerId={c.id} onClose={() => setLinking(false)} onLinked={() => { setLinking(false); flash.ok("CRM record linked. The buyer now sees its invoices."); refresh(); }} />}
      {otp && <SecretBox title="New one-time password" value={otp} note={`Give this to ${c.name}. It is shown once, and they choose their own password at first sign-in.`} onClose={() => setOtp(null)} />}
    </div>
  );
}

function Row2({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-slate-800">{v || "—"}</dd>
    </div>
  );
}

function CustomerEdit({ c, onClose, onSaved }: { c: CustomerFull; onClose: () => void; onSaved: () => void }) {
  const countries = useCountries();
  const [f, setF] = useState({ name: c.name, phone: c.phone ?? "", company: c.company ?? "", countryCode: c.countryCode ?? "", city: c.city ?? "", address: c.address ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.patch(`/api/admin/customers/${c.id}`, { name: f.name.trim(), phone: f.phone.trim(), company: f.company.trim() || null, countryCode: f.countryCode || null, city: f.city.trim() || null, address: f.address.trim() || null });
      onSaved();
    } catch (e) {
      setErr(message(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Edit customer" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={() => void save()}><Save className="size-4" /> Save</Button></>}>
      {err ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone / WhatsApp"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Company"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="Country">
          <Select value={f.countryCode} onChange={(e) => setF({ ...f, countryCode: e.target.value })}>
            <option value="">—</option>
            {countries.data?.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function LinkLead({ customerId, onClose, onLinked }: { customerId: string; onClose: () => void; onLinked: () => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ["admin/link-leads", term],
    queryFn: () => api.get<{ items: { id: string; customerName: string; contactPerson: string; email: string | null; phone: string; customerUserId: string | null }[] }>("/api/crm/leads" + qs({ q: term, pageSize: 8 })),
    enabled: term.length >= 2,
  });
  const link = async (leadId: string) => {
    setBusy(leadId);
    setErr(null);
    try {
      await api.post(`/api/admin/customers/${customerId}/link-lead`, { leadId });
      onLinked();
    } catch (e) {
      setErr(message(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open onClose={onClose} title="Link a CRM record">
      {err ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p> : null}
      <Field label="Search leads" hint="Customer name, phone or e-mail."><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      <ul className="mt-3 divide-y divide-slate-100">
        {list.data?.items.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{l.customerName}</p>
              <p className="truncate text-xs text-slate-500">{[l.contactPerson, l.phone, l.email].filter(Boolean).join(" · ")}</p>
            </div>
            <Button size="sm" variant="secondary" loading={busy === l.id} disabled={!!l.customerUserId && l.customerUserId !== customerId} onClick={() => void link(l.id)}>{l.customerUserId === customerId ? "Linked" : l.customerUserId ? "Taken" : "Link"}</Button>
          </li>
        ))}
      </ul>
      {term.length >= 2 && list.data && !list.data.items.length ? <p className="mt-3 text-sm text-slate-500">No lead matches.</p> : null}
    </Modal>
  );
}

/* ======================== Roles & permissions ======================== */
interface RolesData {
  roles: { id: string; slug: string; name: string; locked: boolean; perms: string[] }[];
  permissions: { key: string; label: string; area: string }[];
}
const AREAS: Record<string, string> = { website: "Website admin", crm: "CRM", auction: "Auction", chat: "Chat", fte: "Digital FTE", system: "System" };

export function AdminRoles() {
  const { can, refresh: refreshMe } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const q = useQuery({ queryKey: ["admin/roles"], queryFn: () => api.get<RolesData>("/api/admin/roles"), enabled: can("auction.roles.manage") });
  const [roleId, setRoleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const role = q.data?.roles.find((r) => r.id === roleId) ?? q.data?.roles.find((r) => r.slug === "manager") ?? q.data?.roles[0];
  useEffect(() => {
    setDraft(null);
  }, [role?.id]);
  if (!can("auction.roles.manage")) return <Denied />;
  if (q.isLoading || !q.data || !role) return <Skeleton className="h-96" />;
  const current = draft ?? new Set(role.perms);
  const dirty = !!draft && (draft.size !== role.perms.length || role.perms.some((p) => !draft.has(p)));
  const toggle = (key: string, on: boolean) => {
    const next = new Set(current);
    if (on) next.add(key);
    else next.delete(key);
    setDraft(next);
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/admin/roles/${role.id}`, { perms: [...current] });
      flash.ok(`${role.name} updated. It applies from their next click.`);
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["admin/roles"] });
      await refreshMe();
    } catch (e) {
      flash.err(e);
    } finally {
      setSaving(false);
    }
  };
  const areas = [...new Set(q.data.permissions.map((p) => p.area))];
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Roles & permissions"
        subtitle="What each role may do. The server checks these on every action."
        actions={<Link to="/crm/users" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"><Users className="size-4" /> Staff & administrators</Link>}
      />
      {flash.node}
      <div className="mb-4">
        <Tabs value={role.id} onChange={setRoleId} items={q.data.roles.filter((r) => r.slug !== "fte" && r.slug !== "customer").map((r) => ({ value: r.id, label: r.name, count: r.perms.length }))} />
      </div>
      {role.locked ? <p className="mb-4 flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100"><ShieldCheck className="size-4" /> The Admin role always has every permission, so nobody can lock the company out of its own system.</p> : null}
      <div className="space-y-3">
        {areas.map((area) => {
          const items = q.data!.permissions.filter((p) => p.area === area);
          const on = items.filter((p) => current.has(p.key)).length;
          return (
            <Card key={area}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{AREAS[area] ?? area}</p>
                <span className="text-xs text-slate-500">{on} of {items.length}</span>
              </div>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {items.map((p) => (
                  <label key={p.key} className={clsx("flex items-start gap-2 rounded-lg px-1 py-1 text-sm", role.locked ? "text-slate-500" : "cursor-pointer text-slate-700 hover:bg-slate-50")}>
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 rounded" disabled={role.locked} checked={role.locked || current.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      {!role.locked ? (
        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 bg-slate-100 py-3">
          <Button variant="secondary" disabled={!dirty} onClick={() => setDraft(null)}>Undo changes</Button>
          <Button loading={saving} disabled={!dirty} onClick={() => void save()}><Save className="size-4" /> Save {role.name}</Button>
        </div>
      ) : null}
    </div>
  );
}

