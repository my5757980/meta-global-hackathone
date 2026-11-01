import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, Check, ExternalLink, FileText, Globe, Image as ImageIcon, Inbox, Mail, Package, Palette, Pencil, Plus, Save, Star, Trash2 } from "lucide-react";
import { formatUsd, WEB_ORDER_STATUSES } from "@autofte/shared";
import { api, ApiError, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ago } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Pagination, Select, Skeleton, StatusBadge, Table, Tabs, Textarea, clsx } from "../ui";

/* ------------------------------------------------------------------ *
 * US9 — website admin CMS. A non-developer runs the public site here. *
 * ------------------------------------------------------------------ */

function useFlash() {
  const [flash, setFlash] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);
  // Stable identities: the edit forms list onError in their load-effect deps, so a new function on every
  // render would re-fetch the record and wipe what the user is typing (e.g. when an old flash times out).
  const ok = useCallback((text: string) => setFlash({ tone: "green", text }), []);
  const err = useCallback((e: unknown) => setFlash({ tone: "red", text: e instanceof ApiError ? e.message : "Something went wrong" }), []);
  const node = flash ? (
    <div className={clsx("mb-4 rounded-xl px-4 py-2.5 text-sm font-semibold", flash.tone === "green" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100" : "bg-rose-50 text-rose-700 ring-1 ring-rose-100")}>{flash.text}</div>
  ) : null;
  return { ok, err, node };
}

function Denied() {
  return <Empty title="No access" text="Your role cannot open this part of the website admin." />;
}

/* ============================ Overview ============================ */
export function AdminOverview() {
  const { can } = useAuth();
  const cards = [
    { to: "/admin/vehicles", label: "Vehicles", desc: "Add, edit and publish stock", icon: <Car className="size-5" />, show: can("website.vehicles.manage") },
    { to: "/admin/orders", label: "Orders", desc: "Order requests from the website and app cart", icon: <Package className="size-5" />, show: can("website.orders.manage") },
    { to: "/admin/home", label: "Home page", desc: "Section titles, order and visibility", icon: <Globe className="size-5" />, show: can("website.content.manage") },
    { to: "/admin/pages", label: "Pages", desc: "About, Terms, Privacy and more", icon: <FileText className="size-5" />, show: can("website.content.manage") },
    { to: "/admin/messages", label: "Messages", desc: "Contact form enquiries", icon: <Mail className="size-5" />, show: can("website.content.manage") },
    { to: "/admin/settings", label: "Branding", desc: "Name, colours, bank & contact", icon: <Palette className="size-5" />, show: can("website.settings.manage") },
  ].filter((c) => c.show);
  return (
    <div>
      <PageHeader title="Website admin" subtitle="Everything the public site shows — edited here, live in seconds." actions={<Button variant="secondary" onClick={() => window.open("/", "_blank")}>Open site <ExternalLink className="size-4" /></Button>} />
      {cards.length === 0 ? (
        <Denied />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.to} to={c.to}>
              <Card className="h-full transition hover:border-brand-300 hover:shadow-md">
                <div className="mb-3 inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600">{c.icon}</div>
                <p className="font-semibold text-slate-900">{c.label}</p>
                <p className="mt-0.5 text-sm text-slate-500">{c.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ Vehicles ============================ */
interface Meta {
  brands: { id: string; name: string; slug: string; models: { id: string; name: string; slug: string }[] }[];
  enums: { bodyTypes: string[]; fuels: string[]; transmissions: string[]; steerings: string[]; drives: string[]; statuses: string[] };
  homeSectionTokens: { key: string; title: string; token: string }[];
}
interface VehRow {
  id: string;
  stockNo: string;
  slug: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  priceUsd: number;
  discountPriceUsd: number | null;
  status: string;
  published: boolean;
  featured: boolean;
  homeSections: string[];
  updatedAt: string;
  image: string | null;
}

export function AdminVehicles() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [published, setPublished] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: string } | "new" | null>(null);

  const meta = useQuery({ queryKey: ["admin/meta"], queryFn: () => api.get<Meta>("/api/admin/meta"), staleTime: 300_000 });
  const list = useQuery({
    queryKey: ["admin/vehicles", { q, status, published, page }],
    queryFn: () => api.get<{ items: VehRow[]; total: number; page: number; pageSize: number }>("/api/admin/vehicles" + qs({ q, status, published, page, pageSize: 20 })),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/vehicles/${id}`),
    onSuccess: () => {
      flash.ok("Vehicle deleted.");
      void qc.invalidateQueries({ queryKey: ["admin/vehicles"] });
    },
    onError: flash.err,
  });

  if (!can("website.vehicles.manage")) return <Denied />;

  return (
    <div>
      <PageHeader title="Vehicles" subtitle="Stock shown on the website and offered by Sora in chat." actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add vehicle</Button>} />
      {flash.node}
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search title, stock no, chassis…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="max-w-xs" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="max-w-[10rem]">
          <option value="">Any status</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </Select>
        <Select value={published} onChange={(e) => { setPublished(e.target.value); setPage(1); }} className="max-w-[11rem]">
          <option value="">Published & drafts</option>
          <option value="true">Published only</option>
          <option value="false">Drafts only</option>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !list.data?.items.length ? (
        <Empty icon={<Car className="size-8" />} title="No vehicles match" text="Try clearing the filters, or add a new vehicle." />
      ) : (
        <>
          <Table head={["Vehicle", "Year", "Price", "Status", "Visibility", ""]}>
            {list.data.items.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {v.image ? <img src={v.image} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" loading="lazy" /> : <div className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-300"><ImageIcon className="size-4" /></div>}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{v.title} {v.featured && <Star className="inline size-3.5 fill-amber-400 text-amber-400" />}</p>
                      <p className="text-xs text-slate-500">{v.stockNo} · {v.brand} {v.model}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{v.year}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{formatUsd(v.discountPriceUsd ?? v.priceUsd)}{v.discountPriceUsd && <span className="ml-1 text-xs font-normal text-slate-400 line-through">{formatUsd(v.priceUsd)}</span>}</td>
                <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                <td className="px-4 py-3">{v.published ? <Badge tone="green">Published</Badge> : <Badge tone="gray">Draft</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <a href={`/vehicles/${v.slug}`} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="View on site"><ExternalLink className="size-4" /></a>
                    <button onClick={() => setEditing({ id: v.id })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil className="size-4" /></button>
                    <button onClick={() => { if (confirm(`Delete "${v.title}"? This cannot be undone.`)) del.mutate(v.id); }} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 className="size-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </>
      )}

      {editing && meta.data && (
        <VehicleForm
          meta={meta.data}
          id={editing === "new" ? null : editing.id}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { flash.ok(msg); setEditing(null); void qc.invalidateQueries({ queryKey: ["admin/vehicles"] }); }}
          onError={flash.err}
        />
      )}
    </div>
  );
}

type Form = Record<string, string | boolean | string[]>;
const num = (v: unknown) => { const s = String(v ?? "").trim(); return s === "" ? undefined : Number(s); };

function VehicleForm({ meta, id, onClose, onSaved, onError }: { meta: Meta; id: string | null; onClose: () => void; onSaved: (msg: string) => void; onError: (e: unknown) => void }) {
  const firstBrand = meta.brands[0];
  const blank: Form = {
    title: "", brandId: firstBrand?.id ?? "", modelId: firstBrand?.models[0]?.id ?? "", modelCode: "", chassisNo: "",
    year: String(new Date().getFullYear() - 3), month: "", priceUsd: "", discountPriceUsd: "", costJpy: "", mileageKm: "",
    fuel: meta.enums.fuels[0] ?? "Petrol", transmission: meta.enums.transmissions[0] ?? "Automatic", bodyType: meta.enums.bodyTypes[0] ?? "Sedan",
    engineCc: "", color: "", steering: "Right", drive: "2WD", doors: "", seats: "", location: "Yokohama", originCountry: "Japan",
    lengthMm: "", widthMm: "", heightMm: "", m3: "",
    shortDesc: "", description: "", videoUrl: "", seoTitle: "", seoDescription: "", seoKeywords: "",
    featured: false, published: true, status: "available", sort: "0", homeSections: [], features: "", tags: "", images: "",
  };
  const [f, setF] = useState<Form>(blank);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | boolean | string[]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!id) return;
    let live = true;
    void api
      .get<Record<string, unknown>>(`/api/admin/vehicles/${id}`)
      .then((v) => {
        if (!live) return;
        const str = (x: unknown) => (x === null || x === undefined ? "" : String(x));
        setF({
          title: str(v.title), brandId: str(v.brandId), modelId: str(v.modelId), modelCode: str(v.modelCode), chassisNo: str(v.chassisNo),
          year: str(v.year), month: str(v.month), priceUsd: str(v.priceUsd), discountPriceUsd: str(v.discountPriceUsd), costJpy: str(v.costJpy), mileageKm: str(v.mileageKm),
          fuel: str(v.fuel), transmission: str(v.transmission), bodyType: str(v.bodyType), engineCc: str(v.engineCc), color: str(v.color),
          steering: str(v.steering) || "Right", drive: str(v.drive) || "2WD", doors: str(v.doors), seats: str(v.seats), location: str(v.location), originCountry: str(v.originCountry),
          lengthMm: str(v.lengthMm), widthMm: str(v.widthMm), heightMm: str(v.heightMm), m3: str(v.m3),
          shortDesc: str(v.shortDesc), description: str(v.description), videoUrl: str(v.videoUrl), seoTitle: str(v.seoTitle), seoDescription: str(v.seoDescription), seoKeywords: str(v.seoKeywords),
          featured: !!v.featured, published: !!v.published, status: str(v.status) || "available", sort: str(v.sort) || "0",
          homeSections: Array.isArray(v.homeSections) ? (v.homeSections as string[]) : [],
          features: Array.isArray(v.features) ? (v.features as string[]).join(", ") : "",
          tags: Array.isArray(v.tags) ? (v.tags as string[]).join(", ") : "",
          images: Array.isArray(v.images) ? (v.images as string[]).join("\n") : "",
        });
      })
      .catch(onError)
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [id, onError]);

  const models = meta.brands.find((b) => b.id === f.brandId)?.models ?? [];

  const submit = async () => {
    if (!String(f.title).trim()) return onError(new ApiError(400, "Give the vehicle a title"));
    if (num(f.year) === undefined || num(f.priceUsd) === undefined || num(f.mileageKm) === undefined) return onError(new ApiError(400, "Year, price and mileage are required"));
    const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const images = String(f.images).split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    const payload: Record<string, unknown> = {
      title: String(f.title).trim(), brandId: f.brandId, modelId: f.modelId,
      modelCode: String(f.modelCode).trim() || null, chassisNo: String(f.chassisNo).trim() || null,
      year: num(f.year), month: num(f.month) ?? null, priceUsd: num(f.priceUsd), discountPriceUsd: num(f.discountPriceUsd) ?? null, costJpy: num(f.costJpy) ?? null,
      mileageKm: num(f.mileageKm), fuel: f.fuel, transmission: f.transmission, bodyType: f.bodyType, engineCc: num(f.engineCc) ?? null, color: String(f.color).trim(),
      steering: f.steering, drive: f.drive, doors: num(f.doors) ?? null, seats: num(f.seats) ?? null, location: String(f.location).trim() || "Yokohama", originCountry: String(f.originCountry).trim() || "Japan",
      lengthMm: num(f.lengthMm) ?? null, widthMm: num(f.widthMm) ?? null, heightMm: num(f.heightMm) ?? null, m3: num(f.m3) ?? null,
      shortDesc: String(f.shortDesc).trim() || null, description: String(f.description).trim() || null, videoUrl: String(f.videoUrl).trim() || null,
      seoTitle: String(f.seoTitle).trim() || null, seoDescription: String(f.seoDescription).trim() || null, seoKeywords: String(f.seoKeywords).trim() || null,
      featured: f.featured, published: f.published, status: f.status, sort: num(f.sort) ?? 0,
      homeSections: f.homeSections, features: toList(String(f.features)), tags: toList(String(f.tags)), images,
    };
    if (!String(f.color).trim()) return onError(new ApiError(400, "Give the colour"));
    setSaving(true);
    try {
      if (id) {
        const r = await api.patch<{ matchedBuyerRequests: number }>(`/api/admin/vehicles/${id}`, payload);
        onSaved(`Saved.${r.matchedBuyerRequests ? ` Sora notified for ${r.matchedBuyerRequests} waiting buyer(s).` : ""}`);
      } else {
        const r = await api.post<{ stockNo: string; matchedBuyerRequests: number }>("/api/admin/vehicles", payload);
        onSaved(`Added ${r.stockNo}.${r.matchedBuyerRequests ? ` Sora notified for ${r.matchedBuyerRequests} waiting buyer(s).` : ""}`);
      }
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={id ? "Edit vehicle" : "Add vehicle"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit}><Save className="size-4" /> {id ? "Save changes" : "Add vehicle"}</Button></>}
    >
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2"><Input value={String(f.title)} onChange={(e) => set("title", e.target.value)} placeholder="2021 Toyota Land Cruiser Prado TX" /></Field>
            <Field label="Brand"><Select value={String(f.brandId)} onChange={(e) => { const b = meta.brands.find((x) => x.id === e.target.value); set("brandId", e.target.value); set("modelId", b?.models[0]?.id ?? ""); }}>{meta.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="Model"><Select value={String(f.modelId)} onChange={(e) => set("modelId", e.target.value)}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <Field label="Model code" hint="e.g. GDJ150W"><Input value={String(f.modelCode)} onChange={(e) => set("modelCode", e.target.value)} /></Field>
            <Field label="Chassis no"><Input value={String(f.chassisNo)} onChange={(e) => set("chassisNo", e.target.value)} /></Field>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pricing</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Price USD"><Input type="number" value={String(f.priceUsd)} onChange={(e) => set("priceUsd", e.target.value)} /></Field>
              <Field label="Discount price USD" hint="optional"><Input type="number" value={String(f.discountPriceUsd)} onChange={(e) => set("discountPriceUsd", e.target.value)} /></Field>
              <Field label="Cost JPY" hint="internal — never shown to buyers"><Input type="number" value={String(f.costJpy)} onChange={(e) => set("costJpy", e.target.value)} /></Field>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Specs</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Year"><Input type="number" value={String(f.year)} onChange={(e) => set("year", e.target.value)} /></Field>
              <Field label="Month" hint="1–12"><Input type="number" value={String(f.month)} onChange={(e) => set("month", e.target.value)} /></Field>
              <Field label="Mileage km"><Input type="number" value={String(f.mileageKm)} onChange={(e) => set("mileageKm", e.target.value)} /></Field>
              <Field label="Fuel"><Select value={String(f.fuel)} onChange={(e) => set("fuel", e.target.value)}>{meta.enums.fuels.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Transmission"><Select value={String(f.transmission)} onChange={(e) => set("transmission", e.target.value)}>{meta.enums.transmissions.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Body type"><Select value={String(f.bodyType)} onChange={(e) => set("bodyType", e.target.value)}>{meta.enums.bodyTypes.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Engine cc"><Input type="number" value={String(f.engineCc)} onChange={(e) => set("engineCc", e.target.value)} /></Field>
              <Field label="Colour"><Input value={String(f.color)} onChange={(e) => set("color", e.target.value)} placeholder="Pearl White" /></Field>
              <Field label="Steering"><Select value={String(f.steering)} onChange={(e) => set("steering", e.target.value)}>{meta.enums.steerings.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Drive"><Select value={String(f.drive)} onChange={(e) => set("drive", e.target.value)}>{meta.enums.drives.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Doors"><Input type="number" value={String(f.doors)} onChange={(e) => set("doors", e.target.value)} /></Field>
              <Field label="Seats"><Input type="number" value={String(f.seats)} onChange={(e) => set("seats", e.target.value)} /></Field>
              <Field label="Length mm"><Input type="number" value={String(f.lengthMm)} onChange={(e) => set("lengthMm", e.target.value)} /></Field>
              <Field label="Width mm"><Input type="number" value={String(f.widthMm)} onChange={(e) => set("widthMm", e.target.value)} /></Field>
              <Field label="Height mm"><Input type="number" value={String(f.heightMm)} onChange={(e) => set("heightMm", e.target.value)} /></Field>
              <Field label="Volume m³" hint="used for freight quotes"><Input type="number" step="0.01" value={String(f.m3)} onChange={(e) => set("m3", e.target.value)} /></Field>
              <Field label="Location"><Input value={String(f.location)} onChange={(e) => set("location", e.target.value)} /></Field>
              <Field label="Origin country"><Input value={String(f.originCountry)} onChange={(e) => set("originCountry", e.target.value)} /></Field>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Description & media</p>
            <div className="space-y-3">
              <Field label="Short description"><Input value={String(f.shortDesc)} onChange={(e) => set("shortDesc", e.target.value)} /></Field>
              <Field label="Full description"><Textarea rows={3} value={String(f.description)} onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Image URLs" hint="one per line — leave blank for an auto illustration"><Textarea rows={2} value={String(f.images)} onChange={(e) => set("images", e.target.value)} placeholder="/api/media/car?body=SUV&color=%23ffffff" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Features" hint="comma separated"><Input value={String(f.features)} onChange={(e) => set("features", e.target.value)} placeholder="Sunroof, Leather, 360 camera" /></Field>
                <Field label="Tags" hint="comma separated"><Input value={String(f.tags)} onChange={(e) => set("tags", e.target.value)} /></Field>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Video & SEO</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Video URL" hint="YouTube link or an .mp4 file" className="sm:col-span-2"><Input value={String(f.videoUrl)} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></Field>
              <Field label="SEO title" hint="browser tab and search results"><Input value={String(f.seoTitle)} onChange={(e) => set("seoTitle", e.target.value)} /></Field>
              <Field label="SEO keywords" hint="comma separated"><Input value={String(f.seoKeywords)} onChange={(e) => set("seoKeywords", e.target.value)} /></Field>
              <Field label="SEO description" className="sm:col-span-2"><Textarea rows={2} value={String(f.seoDescription)} onChange={(e) => set("seoDescription", e.target.value)} /></Field>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Visibility</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Status"><Select value={String(f.status)} onChange={(e) => set("status", e.target.value)}>{meta.enums.statuses.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</Select></Field>
              <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!f.published} onChange={(e) => set("published", e.target.checked)} className="size-4 rounded" /> Published (visible on site)</label>
              <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700"><input type="checkbox" checked={!!f.featured} onChange={(e) => set("featured", e.target.checked)} className="size-4 rounded" /> Featured</label>
              <Field label="Priority" hint="higher shows first on the site (default 0)"><Input type="number" value={String(f.sort)} onChange={(e) => set("sort", e.target.value)} /></Field>
            </div>
            {meta.homeSectionTokens.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-sm font-medium text-slate-700">Show in home sections</p>
                <div className="flex flex-wrap gap-2">
                  {meta.homeSectionTokens.map((t) => {
                    const on = (f.homeSections as string[]).includes(t.token);
                    return (
                      <button key={t.token} type="button" onClick={() => set("homeSections", on ? (f.homeSections as string[]).filter((x) => x !== t.token) : [...(f.homeSections as string[]), t.token])} className={clsx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1", on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
                        {on && <Check className="size-3" />} {t.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

/* ========================= Home sections ========================= */
interface Section { id: string; key: string; title: string; subtitle: string | null; enabled: boolean; sort: number }
export function AdminHome() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const q = useQuery({ queryKey: ["admin/home-sections"], queryFn: () => api.get<Section[]>("/api/admin/home-sections") });
  const save = useMutation({
    mutationFn: (s: Section) => api.patch(`/api/admin/home-sections/${s.id}`, { title: s.title, subtitle: s.subtitle, enabled: s.enabled, sort: s.sort }),
    onSuccess: () => { flash.ok("Home section saved — refresh the site to see it."); void qc.invalidateQueries({ queryKey: ["admin/home-sections"] }); },
    onError: flash.err,
  });
  const [draft, setDraft] = useState<Record<string, Section>>({});
  const row = (s: Section) => draft[s.id] ?? s;
  const edit = (s: Section, patch: Partial<Section>) => setDraft((d) => ({ ...d, [s.id]: { ...row(s), ...patch } }));

  if (!can("website.content.manage")) return <Denied />;
  return (
    <div>
      <PageHeader title="Home page sections" subtitle="Titles, subtitles, order and what shows on the public home page." actions={<Button variant="secondary" onClick={() => window.open("/", "_blank")}>Open home <ExternalLink className="size-4" /></Button>} />
      {flash.node}
      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="space-y-3">
          {q.data?.map((s0) => {
            const s = row(s0);
            const dirty = JSON.stringify(s) !== JSON.stringify(s0);
            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{s.key}</code>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={s.enabled} onChange={(e) => edit(s0, { enabled: e.target.checked })} className="size-4 rounded" /> Visible</label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
                  <Field label="Title"><Input value={s.title} onChange={(e) => edit(s0, { title: e.target.value })} /></Field>
                  <Field label="Subtitle"><Input value={s.subtitle ?? ""} onChange={(e) => edit(s0, { subtitle: e.target.value })} /></Field>
                  <Field label="Order"><Input type="number" value={String(s.sort)} onChange={(e) => edit(s0, { sort: Number(e.target.value) || 0 })} /></Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" disabled={!dirty} loading={save.isPending && save.variables?.id === s.id} onClick={() => save.mutate(s)}><Save className="size-4" /> Save</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================= Pages ============================= */
interface PageRow { id: string; slug: string; title: string; published: boolean; updatedAt: string }
export function AdminPagesList() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const q = useQuery({ queryKey: ["admin/pages"], queryFn: () => api.get<PageRow[]>("/api/admin/pages") });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/pages/${id}`),
    onSuccess: () => { flash.ok("Page deleted."); void qc.invalidateQueries({ queryKey: ["admin/pages"] }); },
    onError: flash.err,
  });
  if (!can("website.content.manage")) return <Denied />;
  return (
    <div>
      <PageHeader title="Pages" subtitle="Static pages like About, How to buy, Terms and Privacy." actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New page</Button>} />
      {flash.node}
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !q.data?.length ? (
        <Empty icon={<FileText className="size-8" />} title="No pages yet" />
      ) : (
        <Table head={["Page", "Path", "Status", ""]}>
          {q.data.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-900">{p.title}</td>
              <td className="px-4 py-3"><code className="text-xs text-slate-500">/{p.slug}</code></td>
              <td className="px-4 py-3">{p.published ? <Badge tone="green">Published</Badge> : <Badge tone="gray">Draft</Badge>}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="View"><ExternalLink className="size-4" /></a>
                  <button onClick={() => setEditing(p.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil className="size-4" /></button>
                  <button onClick={() => { if (confirm(`Delete page "${p.title}"?`)) del.mutate(p.id); }} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 className="size-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <PageForm id={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { flash.ok("Page saved."); setEditing(null); void qc.invalidateQueries({ queryKey: ["admin/pages"] }); }} onError={flash.err} />}
    </div>
  );
}

function PageForm({ id, onClose, onSaved, onError }: { id: string | null; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void }) {
  const [f, setF] = useState({ slug: "", title: "", body: "", seoTitle: "", seoDescription: "", published: true });
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!id) return;
    let live = true;
    void api.get<Record<string, unknown>>(`/api/admin/pages/${id}`).then((p) => { if (live) setF({ slug: String(p.slug ?? ""), title: String(p.title ?? ""), body: String(p.body ?? ""), seoTitle: String(p.seoTitle ?? ""), seoDescription: String(p.seoDescription ?? ""), published: !!p.published }); }).catch(onError).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [id, onError]);
  const submit = async () => {
    setSaving(true);
    try {
      const body = { slug: f.slug.trim(), title: f.title.trim(), body: f.body, seoTitle: f.seoTitle.trim() || null, seoDescription: f.seoDescription.trim() || null, published: f.published };
      if (id) await api.patch(`/api/admin/pages/${id}`, body);
      else await api.post("/api/admin/pages", body);
      onSaved();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={id ? "Edit page" : "New page"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit}><Save className="size-4" /> Save</Button></>}>
      {loading ? <Skeleton className="h-40" /> : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Path (slug)" hint="lowercase, dashes — e.g. how-to-buy"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} disabled={!!id} /></Field>
          </div>
          <Field label="Body" hint="Markdown supported"><Textarea rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="SEO title"><Input value={f.seoTitle} onChange={(e) => setF({ ...f, seoTitle: e.target.value })} /></Field>
            <Field label="SEO description"><Input value={f.seoDescription} onChange={(e) => setF({ ...f, seoDescription: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} className="size-4 rounded" /> Published</label>
        </div>
      )}
    </Modal>
  );
}

/* ============================ Settings ============================ */
export function AdminSettings() {
  const { can } = useAuth();
  const flash = useFlash();
  const q = useQuery({ queryKey: ["admin/site"], queryFn: () => api.get<Record<string, unknown>>("/api/admin/site") });
  const [f, setF] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  if (!can("website.settings.manage")) return <Denied />;
  const bank = (f.bank as Record<string, string>) ?? {};
  const t = (k: string) => String(f[k] ?? "");
  const setBank = (k: string, v: string) => setF({ ...f, bank: { ...bank, [k]: v } });
  const submit = async () => {
    setSaving(true);
    try { const r = await api.put<{ site: Record<string, unknown> }>("/api/admin/site", f); setF(r.site); flash.ok("Branding saved — it shows across the whole site and Sora's messages."); }
    catch (e) { flash.err(e); } finally { setSaving(false); }
  };
  return (
    <div className="max-w-3xl">
      <PageHeader title="Branding & settings" subtitle="One place for the company identity used across the site, invoices and Sora." />
      {flash.node}
      {q.isLoading ? <Skeleton className="h-80" /> : (
        <div className="space-y-5">
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name"><Input value={t("companyName")} onChange={(e) => setF({ ...f, companyName: e.target.value })} /></Field>
              <Field label="Digital FTE name" hint="the AI assistant's name"><Input value={t("ftEName")} onChange={(e) => setF({ ...f, ftEName: e.target.value })} /></Field>
              <Field label="Tagline" className="sm:col-span-2"><Input value={t("tagline")} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
              <Field label="Primary colour"><div className="flex gap-2"><input type="color" value={t("primaryColor") || "#0f4c81"} onChange={(e) => setF({ ...f, primaryColor: e.target.value })} className="h-10 w-14 rounded-lg border border-slate-200" /><Input value={t("primaryColor")} onChange={(e) => setF({ ...f, primaryColor: e.target.value })} /></div></Field>
              <Field label="Accent colour"><div className="flex gap-2"><input type="color" value={t("accentColor") || "#f59e0b"} onChange={(e) => setF({ ...f, accentColor: e.target.value })} className="h-10 w-14 rounded-lg border border-slate-200" /><Input value={t("accentColor")} onChange={(e) => setF({ ...f, accentColor: e.target.value })} /></div></Field>
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold text-slate-700">Contact</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone"><Input value={t("phone")} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="WhatsApp"><Input value={t("whatsapp")} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field>
              <Field label="Email"><Input value={t("email")} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Invoice prefix"><Input value={t("invoicePrefix")} onChange={(e) => setF({ ...f, invoicePrefix: e.target.value })} /></Field>
              <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={t("address")} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold text-slate-700">Bank details <span className="font-normal text-slate-400">(shown with approved invoices)</span></p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bank name"><Input value={bank.bankName ?? ""} onChange={(e) => setBank("bankName", e.target.value)} /></Field>
              <Field label="Branch"><Input value={bank.branch ?? ""} onChange={(e) => setBank("branch", e.target.value)} /></Field>
              <Field label="SWIFT"><Input value={bank.swift ?? ""} onChange={(e) => setBank("swift", e.target.value)} /></Field>
              <Field label="Account name"><Input value={bank.accountName ?? ""} onChange={(e) => setBank("accountName", e.target.value)} /></Field>
              <Field label="Account no"><Input value={bank.accountNo ?? ""} onChange={(e) => setBank("accountNo", e.target.value)} /></Field>
            </div>
          </Card>
          <div className="flex justify-end"><Button loading={saving} onClick={submit}><Save className="size-4" /> Save branding</Button></div>
        </div>
      )}
    </div>
  );
}

/* ============================ Messages ============================ */
interface Msg { id: string; name: string; email: string; phone: string | null; subject: string | null; message: string; handled: boolean; createdAt: string }
export function AdminMessages() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const [tab, setTab] = useState<"false" | "">("false");
  const q = useQuery({ queryKey: ["admin/messages", tab], queryFn: () => api.get<Msg[]>("/api/admin/messages" + qs({ handled: tab })) });
  const mark = useMutation({
    mutationFn: ({ id, handled }: { id: string; handled: boolean }) => api.post(`/api/admin/messages/${id}/handled`, { handled }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin/messages"] }); },
    onError: flash.err,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/messages/${id}`),
    onSuccess: () => { flash.ok("Message deleted."); void qc.invalidateQueries({ queryKey: ["admin/messages"] }); },
    onError: flash.err,
  });
  if (!can("website.content.manage")) return <Denied />;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Contact messages" subtitle="Enquiries from the website contact form." />
      {flash.node}
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: "false", label: "Unhandled" }, { value: "", label: "All" }]} /></div>
      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !q.data?.length ? (
        <Empty icon={<Inbox className="size-8" />} title="Nothing here" text="New contact enquiries will appear here." />
      ) : (
        <div className="space-y-3">
          {q.data.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{m.name} {m.handled && <Badge tone="green">Handled</Badge>}</p>
                  <p className="text-xs text-slate-500">{m.email}{m.phone ? ` · ${m.phone}` : ""} · {ago(m.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!m.handled ? (
                    <Button size="sm" variant="secondary" loading={mark.isPending && mark.variables?.id === m.id} onClick={() => mark.mutate({ id: m.id, handled: true })}><Check className="size-4" /> Mark handled</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => mark.mutate({ id: m.id, handled: false })}>Reopen</Button>
                  )}
                  <button onClick={() => { if (confirm(`Delete the message from ${m.name}?`)) del.mutate(m.id); }} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 className="size-4" /></button>
                </div>
              </div>
              {m.subject && <p className="mt-2 text-sm font-medium text-slate-700">{m.subject}</p>}
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{m.message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== Orders ============================== */
interface AdminOrderRow {
  id: string;
  orderNo: string;
  status: string;
  totalUsd: number;
  notes: string | null;
  createdAt: string;
  items: number;
  customer: { id: string; name: string; email: string | null; phone: string | null; countryCode: string | null };
}
interface AdminOrderDetail extends Omit<AdminOrderRow, "items" | "customer"> {
  customer: AdminOrderRow["customer"] & { company: string | null };
  items: { id: string; vehicleId: string | null; title: string; priceUsd: number; slug: string | null; status: string | null }[];
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AdminOrders() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const flash = useFlash();
  const [tab, setTab] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin/orders", tab],
    queryFn: () => api.get<{ items: AdminOrderRow[]; counts: Record<string, number> }>("/api/admin/orders" + qs({ status: tab })),
    enabled: can("website.orders.manage"),
  });
  if (!can("website.orders.manage")) return <Denied />;
  const counts = q.data?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div>
      <PageHeader title="Website orders" subtitle="Order requests sent from the website and the app cart. Confirm availability, then send the invoice from the CRM." />
      {flash.node}
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} items={[{ value: "", label: "All", count: all }, ...WEB_ORDER_STATUSES.map((s) => ({ value: s as string, label: cap(s), count: counts[s] ?? 0 }))]} />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !q.data?.items.length ? (
        <Empty icon={<Package className="size-8" />} title="No orders here" text="Orders appear when a buyer checks out their cart." />
      ) : (
        <Table head={["Order", "Customer", "Cars", "Total", "Status", "Received"]}>
          {q.data.items.map((o) => (
            <tr key={o.id} onClick={() => setOpen(o.id)} className="cursor-pointer hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-900">{o.orderNo}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{o.customer.name}</p>
                <p className="text-xs text-slate-500">{o.customer.email}</p>
              </td>
              <td className="px-4 py-3 text-slate-600">{o.items}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{formatUsd(o.totalUsd)}</td>
              <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
              <td className="px-4 py-3 text-slate-500">{ago(o.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      {open && (
        <OrderModal
          id={open}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            flash.ok(msg);
            void qc.invalidateQueries({ queryKey: ["admin/orders"] });
          }}
          onError={flash.err}
        />
      )}
    </div>
  );
}

function OrderModal({ id, onClose, onSaved, onError }: { id: string; onClose: () => void; onSaved: (msg: string) => void; onError: (e: unknown) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin/order", id], queryFn: () => api.get<AdminOrderDetail>(`/api/admin/orders/${id}`) });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const o = q.data;
  const current = status ?? o?.status ?? "pending";
  const save = async () => {
    if (!o || current === o.status) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/orders/${id}`, { status: current });
      await qc.invalidateQueries({ queryKey: ["admin/order", id] });
      onSaved(`${o.orderNo} is now ${current}. The buyer sees it in their account and in the chat.`);
      onClose();
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={o ? `Order ${o.orderNo}` : "Order"}
      footer={
        o && (
          <>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button loading={saving} disabled={current === o.status} onClick={save}>
              <Save className="size-4" /> Update status
            </Button>
          </>
        )
      }
    >
      {!o ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card padded={false} className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</p>
              <p className="mt-1 font-semibold text-slate-900">{o.customer.name}</p>
              <p className="text-sm text-slate-600">{o.customer.email}</p>
              {o.customer.phone && <p className="text-sm text-slate-600">{o.customer.phone}</p>}
              {(o.customer.company || o.customer.countryCode) && <p className="text-xs text-slate-500">{[o.customer.company, o.customer.countryCode].filter(Boolean).join(" · ")}</p>}
            </Card>
            <Card padded={false} className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
              <Select className="mt-1" value={current} onChange={(e) => setStatus(e.target.value)}>
                {WEB_ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{cap(s)}</option>
                ))}
              </Select>
              <p className="mt-2 text-xs text-slate-500">
                Received {ago(o.createdAt)} · {o.items.length} car{o.items.length === 1 ? "" : "s"} · {formatUsd(o.totalUsd)}
              </p>
            </Card>
          </div>
          {o.notes && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
              <span className="font-semibold">Note from the buyer:</span> {o.notes}
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0">
                  {i.slug ? (
                    <a href={`/vehicles/${i.slug}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-800 hover:text-brand-700">{i.title}</a>
                  ) : (
                    <span className="block truncate text-sm font-medium text-slate-800">{i.title}</span>
                  )}
                  {i.status && <StatusBadge status={i.status} />}
                </span>
                <span className="shrink-0 font-semibold text-slate-900">{formatUsd(i.priceUsd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
