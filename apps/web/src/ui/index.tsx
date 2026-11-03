import clsx from "clsx";
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router";
import { Loader2, X } from "lucide-react";
import { initials } from "../lib/format";

export { clsx };

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
  accent: "bg-accent-500 text-slate-900 hover:bg-accent-400 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
};
const sizes = { sm: "h-8 px-3 text-sm gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-base gap-2" };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; loading?: boolean }>(
  ({ variant = "primary", size = "md", loading, className, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60", variants[variant], sizes[size], className)}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  ),
);

export function LinkButton({ to, variant = "primary", size = "md", className, children }: { to: string; variant?: Variant; size?: keyof typeof sizes; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={clsx("inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition", variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}

const fieldBase = "w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={clsx(fieldBase, "h-10", className)} {...p} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={clsx(fieldBase, "h-10 pr-8", className)} {...p}>
    {children}
  </select>
));
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={clsx(fieldBase, "py-2", className)} {...p} />);

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children, padded = true }: { className?: string; children: ReactNode; padded?: boolean }) {
  return <div className={clsx("rounded-2xl border border-slate-200/80 bg-white shadow-sm", padded && "p-5", className)}>{children}</div>;
}

const tones = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
  red: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
};
export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, keyof typeof tones> = {
  pending: "amber",
  approved: "green",
  sent: "blue",
  rejected: "red",
  new: "blue",
  in_progress: "violet",
  invoice_requested: "amber",
  invoiced: "green",
  closed: "gray",
  available: "green",
  reserved: "amber",
  sold: "gray",
  confirmed: "blue",
  paid: "green",
  payment_received: "green",
  shipped: "violet",
  delivered: "green",
  cancelled: "red",
  ok: "green",
  handover: "amber",
  error: "red",
  running: "blue",
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{label ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-5 animate-spin text-brand-600", className)} />;
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="font-semibold text-slate-800">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, kind, size = 36, online }: { name?: string | null; kind?: string | null; size?: number; online?: boolean }) {
  const bg = kind === "fte" ? "bg-gradient-to-br from-violet-500 to-brand-600 text-white" : kind === "staff" ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-800";
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className={clsx("flex size-full items-center justify-center rounded-full text-xs font-bold", bg)}>{kind === "fte" ? "AI" : initials(name)}</span>
      {online !== undefined && <span className={clsx("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white", online ? "bg-emerald-500" : "bg-slate-300")} />}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={clsx("max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div role="tablist" className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={clsx("inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition", value === it.value ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-white")}
        >
          {it.label}
          {it.count !== undefined && <span className={clsx("rounded-full px-1.5 text-xs", value === it.value ? "bg-white/20" : "bg-slate-200")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="flex items-start gap-3">
      {icon && <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold [overflow-wrap:anywhere] text-slate-900 sm:text-2xl">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, sizes = [25, 50, 100] }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void; sizes?: number[] }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && !onPageSize) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span className="flex flex-wrap items-center gap-3">
        <span>
          {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(total, page * pageSize)} of {total.toLocaleString("en-US")}
        </span>
        {onPageSize && (
          <label className="flex items-center gap-1.5">
            <span>Rows per page</span>
            <select className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-sm" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {[...new Set([...sizes, pageSize])].sort((a, b) => a - b).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </span>
      {pages > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(1)}>
            First
          </Button>
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span className="self-center text-xs whitespace-nowrap">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(pages)}>
            Last
          </Button>
        </div>
      )}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("scrollbar-thin overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
