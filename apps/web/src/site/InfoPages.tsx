import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronRight, ClipboardCheck, Clock, Copy, Car, FileText, Gavel, Headphones, Landmark, Mail, MapPin, Phone, Ship } from "lucide-react";
import { api } from "../lib/api";
import { date, miniMarkdown } from "../lib/format";
import { useFte, useSite } from "../lib/site";
import { Button, Card, Empty, Field, Input, Skeleton, Textarea } from "../ui";

export function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <div className="bg-gradient-to-r from-brand-800 to-brand-600 py-10 text-white">
        <div className="container-page">
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-brand-100">{subtitle}</p>}
        </div>
      </div>
      <div className="container-page py-8">{children}</div>
    </div>
  );
}

export function ContentPageView({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ["page", slug], queryFn: () => api.get<{ title: string; body: string }>(`/api/public/pages/${slug}`) });
  return (
    <PageShell title={q.data?.title ?? "…"}>
      <Card className="prose-lite max-w-3xl text-slate-700">{q.isLoading ? <Skeleton className="h-40" /> : <div dangerouslySetInnerHTML={{ __html: miniMarkdown(q.data?.body ?? "") }} />}</Card>
    </PageShell>
  );
}

const SERVICE_ICONS: Record<string, ReactNode> = { Gavel: <Gavel />, Car: <Car />, ClipboardCheck: <ClipboardCheck />, Ship: <Ship />, FileText: <FileText />, Headphones: <Headphones /> };

export function ServicesView() {
  const fte = useFte();
  const q = useQuery({ queryKey: ["services"], queryFn: () => api.get<{ title: string; body: string; icon: string }[]>("/api/public/services") });
  return (
    <PageShell title="Our services" subtitle={`From the auction hall in Japan to your port — one team, one record, and ${fte} answering 24/7.`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {q.data?.map((s) => (
          <Card key={s.title}>
            <div className="mb-3 inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600 [&_svg]:size-6">{SERVICE_ICONS[s.icon]}</div>
            <p className="font-semibold text-slate-900">{s.title}</p>
            <p className="mt-1 text-sm text-slate-600">{s.body}</p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

export function FaqView() {
  const q = useQuery({ queryKey: ["faqs"], queryFn: () => api.get<{ question: string; answer: string; category: string }[]>("/api/public/faqs") });
  const cats = [...new Set(q.data?.map((f) => f.category))];
  return (
    <PageShell title="Frequently asked questions">
      <div className="max-w-3xl space-y-6">
        {cats.map((c) => (
          <div key={c}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{c}</h2>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {q.data!
                .filter((f) => f.category === c)
                .map((f) => (
                  <details key={f.question} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">
                      {f.question}
                      <ChevronRight className="size-4 shrink-0 transition group-open:rotate-90" />
                    </summary>
                    <p className="mt-2 text-sm text-slate-600">{f.answer}</p>
                  </details>
                ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function LocationsView() {
  const site = useSite();
  const q = useQuery({ queryKey: ["locations"], queryFn: () => api.get<{ name: string; address: string; phone: string; email: string; mapUrl?: string | null }[]>("/api/public/locations") });
  return (
    <PageShell title="Our locations">
      <div className="grid gap-4 sm:grid-cols-2">
        {q.data?.map((l) => (
          <Card key={l.name}>
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <Building2 className="size-5 text-brand-600" /> {l.name}
            </p>
            <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
              <MapPin className="mt-0.5 size-4 shrink-0" /> {l.address}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <Phone className="size-4" /> {l.phone}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <Mail className="size-4" /> {l.email}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <Clock className="size-4" /> {site?.hours}
            </p>
            {l.mapUrl && <a href={l.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand-700">Open the map →</a>}
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

export function PartnersView() {
  const q = useQuery({ queryKey: ["partners"], queryFn: () => api.get<{ name: string; logoUrl: string | null; url: string | null }[]>("/api/public/partners") });
  return (
    <PageShell title="Official partners" subtitle="Shipping lines, inspection and courier partners we work with (demo names).">
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
        {q.data?.map((p) => (
          <Card key={p.name} className="flex items-center gap-3 break-words">
            {p.logoUrl ? <img src={p.logoUrl} alt="" className="size-12 shrink-0 rounded-xl object-contain" /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-extrabold text-slate-600">{p.name.slice(0, 2).toUpperCase()}</span>}
            <span className="text-sm font-semibold text-slate-800">{p.name}</span>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["Finding the car", "Membership in trade bodies and halls gets us to more cars, sooner."],
          ["Checking it", "Inspection partners give you a second pair of eyes before you pay."],
          ["Getting it to you", "Shipping and courier partners move the car and its papers to your port."],
        ].map(([h2, d]) => (
          <Card key={h2}>
            <p className="font-semibold text-slate-900">{h2}</p>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </Card>
        ))}
      </div>
      <h2 className="mt-8 mb-3 text-lg font-bold text-slate-900">How a purchase runs through them</h2>
      <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tell us what you need", "The kind of car, the budget, the port."],
          ["We search the network", "Our stock, this week's auctions, partner yards."],
          ["You check it", "The sheet, the photos, the price, the documents."],
          ["We prepare the export", "Paperwork, inspection and the ship."],
        ].map(([h2, d], i) => (
          <li key={h2} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-brand-700">Step {i + 1}</p>
            <p className="font-semibold text-slate-900">{h2}</p>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </li>
        ))}
      </ol>
      <Link to="/contact" className="mt-6 inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Ask about a partner</Link>
    </PageShell>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-right font-semibold text-slate-900">
        <span className="min-w-0 break-words">{value}</span>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        </button>
      </dd>
    </div>
  );
}

export function BankView() {
  const site = useSite();
  const steps = [
    ["Match the invoice", "Check the amount, the currency and the account name on your invoice."],
    ["Use the account we name", "Pay the account for your office exactly as your invoice says."],
    ["Send the slip", "Upload the bank slip on your invoice or in the chat. Our accounts desk reads it at once."],
  ];
  return (
    <PageShell title="Bank details" subtitle="Pay only by bank transfer to a company account. We never ask for payment to a personal account.">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {steps.map(([t2, d], i) => (
          <Card key={t2}>
            <p className="text-xs font-bold text-brand-700">Step {i + 1}</p>
            <p className="font-semibold text-slate-900">{t2}</p>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {site?.bankAccounts.map((a2) => (
          <Card key={a2.label}>
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <Landmark className="size-5 text-brand-600" /> {a2.label} account (demo)
            </p>
            <dl className="mt-3 text-sm">
              <CopyValue label="Bank" value={a2.bankName} />
              <CopyValue label="Branch" value={a2.branch} />
              <CopyValue label="SWIFT" value={a2.swift} />
              <CopyValue label="Account name" value={a2.accountName} />
              <CopyValue label="Account no." value={a2.accountNo} />
              {a2.address && <CopyValue label="Address" value={a2.address} />}
            </dl>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-600">Use your invoice number as the payment reference. Not sure? Ask us at {site?.email} or {site?.phone} before you send anything.</p>
    </PageShell>
  );
}

interface BlogRow {
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string;
  publishedAt: string;
}

function RecentPosts({ posts, skip }: { posts?: BlogRow[]; skip?: string }) {
  return (
    <Card>
      <p className="mb-2 font-semibold text-slate-900">Recent posts</p>
      <ul className="space-y-2 text-sm">
        {posts?.filter((b) => b.slug !== skip).slice(0, 5).map((b) => (
          <li key={b.slug}>
            <Link to={`/blog/${b.slug}`} className="font-medium text-slate-700 hover:text-brand-700">{b.title}</Link>
            <span className="block text-xs text-slate-500">{date(b.publishedAt)}</span>
          </li>
        ))}
      </ul>
      <Link to="/contact" className="mt-3 block rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">Need help importing? Ask us →</Link>
    </Card>
  );
}

export function BlogView() {
  const q = useQuery({ queryKey: ["blog"], queryFn: () => api.get<BlogRow[]>("/api/public/blog") });
  const [term, setTerm] = useState("");
  const needle = term.trim().toLowerCase();
  const rows = q.data?.filter((b) => !needle || b.title.toLowerCase().includes(needle) || b.excerpt.toLowerCase().includes(needle));
  return (
    <PageShell title="Guides" subtitle="Practical guides for importing a car from Japan.">
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <div className="mb-4 max-w-md">
            <Input aria-label="Search guides" placeholder="Search guides" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          {rows && !rows.length && <Empty title="No guides found" text="Try another word." />}
          <div className="grid gap-4 sm:grid-cols-2">
            {rows?.map((b) => (
              <Link key={b.slug} to={`/blog/${b.slug}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md">
                {b.coverUrl ? <img src={b.coverUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" /> : null}
                <div className="p-4">
                  <p className="text-xs text-slate-500">{date(b.publishedAt)}</p>
                  <p className="mt-1 font-semibold text-slate-900">{b.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{b.excerpt}</p>
                  <p className="mt-2 text-sm font-semibold text-brand-700">Read more →</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <aside><RecentPosts posts={q.data} /></aside>
      </div>
    </PageShell>
  );
}

export function BlogPostView() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ["blog", slug], queryFn: () => api.get<{ title: string; body: string; coverUrl: string; publishedAt: string }>(`/api/public/blog/${slug}`), retry: false });
  const all = useQuery({ queryKey: ["blog"], queryFn: () => api.get<BlogRow[]>("/api/public/blog") });
  if (q.isError) return <div className="container-page py-16"><Empty title="Article not found" /></div>;
  return (
    <PageShell title={q.data?.title ?? "…"} subtitle={q.data ? date(q.data.publishedAt) : undefined}>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="prose-lite min-w-0 text-slate-700">
          {q.data?.coverUrl && <img src={q.data.coverUrl} alt="" className="mb-4 w-full rounded-xl" />}
          <div dangerouslySetInnerHTML={{ __html: miniMarkdown(q.data?.body ?? "") }} />
          <Link to="/blog" className="mt-4 inline-block text-sm font-semibold text-brand-700">← Back to guides</Link>
        </Card>
        <aside><RecentPosts posts={all.data} skip={slug} /></aside>
      </div>
    </PageShell>
  );
}

export function ContactView() {
  const fte = useFte();
  const site = useSite();
  const [f, setF] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <PageShell title="Contact us" subtitle={`Write to us — or open the chat for an instant answer from ${fte}.`}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          {state === "done" ? (
            <p className="text-sm text-emerald-700">Thank you — your message reached our team. We usually reply within a few hours.</p>
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setState("busy");
                try {
                  await api.post("/api/public/contact", { ...f, phone: f.phone || undefined, subject: f.subject || undefined });
                  setState("done");
                } catch (ex) {
                  setState((ex as Error).message);
                }
              }}
            >
              <Field label="Name">
                <Input required minLength={2} value={f.name} onChange={set("name")} />
              </Field>
              <Field label="E-mail">
                <Input required type="email" value={f.email} onChange={set("email")} />
              </Field>
              <Field label="Phone (optional)">
                <Input value={f.phone} onChange={set("phone")} />
              </Field>
              <Field label="Subject (optional)">
                <Input value={f.subject} onChange={set("subject")} />
              </Field>
              <Field label="Message" className="sm:col-span-2">
                <Textarea required minLength={5} rows={5} value={f.message} onChange={set("message")} />
              </Field>
              {state !== "idle" && state !== "busy" && <p className="text-sm text-rose-600 sm:col-span-2">{state}</p>}
              <Button type="submit" loading={state === "busy"} className="sm:col-span-2 sm:justify-self-start">
                Send message
              </Button>
            </form>
          )}
        </Card>
        <Card>
          <p className="font-semibold text-slate-900">Head office</p>
          <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
            <MapPin className="mt-0.5 size-4 shrink-0" /> {site?.address}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <Phone className="size-4" /> {site?.phone}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <Mail className="size-4" /> {site?.email}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <Clock className="size-4" /> {site?.hours}
          </p>
          {site?.whatsapp && (
            <a href={`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 items-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
              Open WhatsApp
            </a>
          )}
          <p className="mt-5 font-semibold text-slate-900">A faster answer: tell us</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li><strong className="text-slate-800">The car:</strong> make, model, year, mileage, condition.</li>
            <li><strong className="text-slate-800">The destination:</strong> country and port.</li>
            <li><strong className="text-slate-800">The budget:</strong> what you can spend, delivered.</li>
          </ul>
          <Link to="/locations" className="mt-4 block text-sm font-semibold text-brand-700">Find the nearest office →</Link>
        </Card>
      </div>
    </PageShell>
  );
}
