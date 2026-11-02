import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { clsx } from "../ui";

interface Hit {
  slug: string;
  title: string;
  stockNo: string;
}

/** The car search. Suggestions appear while typing: one opens that car, Enter searches the whole stock. */
export function SearchBox({ value = "", placeholder, onSearch, searchOnBlur, inputClassName, listClassName = "inset-x-0" }: { value?: string; placeholder: string; onSearch: (q: string) => void; searchOnBlur?: boolean; inputClassName?: string; listClassName?: string }) {
  const nav = useNavigate();
  const listId = useId();
  const [q, setQ] = useState(value);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  useEffect(() => setQ(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setAt(-1), [term]);
  const hits = useQuery({
    queryKey: ["suggest", term],
    queryFn: () => api.get<Hit[]>(`/api/public/vehicles/suggest${qs({ q: term })}`),
    enabled: open && term.length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const items = open && q.trim().length >= 2 ? (hits.data ?? []) : [];

  const go = (h: Hit) => {
    setOpen(false);
    nav(`/vehicles/${h.slug}`);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const h = items[at];
      if (h) go(h);
      else {
        setOpen(false);
        onSearch(q.trim());
      }
    } else if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setAt((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setAt((i) => (i <= 0 ? items.length - 1 : i - 1));
    }
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        role="combobox"
        aria-label="Search cars"
        aria-autocomplete="list"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-activedescendant={items[at] ? `${listId}-${at}` : undefined}
        autoComplete="off"
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          if (searchOnBlur && q.trim() !== value) onSearch(q.trim());
        }}
        onKeyDown={onKeyDown}
        className={clsx("h-10 w-full rounded-xl border border-slate-200 pr-3 pl-9 text-sm focus:border-brand-500 focus:outline-none", inputClassName)}
      />
      <ul id={listId} role="listbox" aria-label="Suggestions" hidden={!items.length} className={clsx("absolute top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl", listClassName)}>
        {items.map((h, i) => (
          <li key={h.slug} id={`${listId}-${i}`} role="option" aria-selected={i === at}>
            {/* mouse down keeps the focus in the input, so the click still lands before the list closes */}
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => go(h)} className={clsx("flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100", i === at && "bg-slate-100")}>
              <span className="min-w-0 font-medium text-slate-800">{h.title}</span>
              <span className="shrink-0 text-xs text-slate-400">{h.stockNo}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
