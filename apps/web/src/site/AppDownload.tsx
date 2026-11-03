import { useQuery } from "@tanstack/react-query";
import { Download, Smartphone } from "lucide-react";
import { api } from "../lib/api";
import { useSite } from "../lib/site";
import { Card } from "../ui";

/** The app's own page: what it is, the file, and how to install it from outside a store. */
export default function AppDownload() {
  const site = useSite();
  const q = useQuery({ queryKey: ["app-info"], queryFn: () => api.get<{ version: string; sizeMb: number; url: string | null; needs: string }>("/api/public/app-info") });
  const d = q.data;
  return (
    <div className="container-page py-10">
      <Card className="mx-auto max-w-xl p-6 sm:p-8">
        <p className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Smartphone className="size-7 text-brand-600" /> {site?.companyName} for Android
        </p>
        <p className="mt-1 text-sm text-slate-600">The shop, your invoices and the same chat as the website, on your phone. Sign in with your website account.</p>
        {d?.url ? (
          <a href={d.url} className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700">
            <Download className="size-5" /> Download for Android
          </a>
        ) : (
          <p className="mt-5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">The download link is not set on this server yet.</p>
        )}
        <dl className="mt-5 space-y-1 text-sm">
          <div className="flex justify-between border-b border-slate-100 py-1"><dt className="text-slate-500">Version</dt><dd className="font-semibold">{d?.version ?? "…"}</dd></div>
          {!!d?.sizeMb && <div className="flex justify-between border-b border-slate-100 py-1"><dt className="text-slate-500">Size</dt><dd className="font-semibold">{d.sizeMb} MB</dd></div>}
          <div className="flex justify-between border-b border-slate-100 py-1"><dt className="text-slate-500">Needs</dt><dd className="font-semibold">{d?.needs ?? "…"}</dd></div>
        </dl>
        <p className="mt-5 font-semibold text-slate-900">How to install</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Tap Download above.</li>
          <li>Open the downloaded file. If the phone asks, allow installing from this browser.</li>
          <li>Install, open, and sign in with your website account.</li>
        </ol>
      </Card>
    </div>
  );
}
