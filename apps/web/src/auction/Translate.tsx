import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * The language picker. The page's words go to our own translation route (the same open model the FTEs run on) and come back
 * in the chosen language. Only each text node's value changes, so React's own tree stays as it was. Numbers, inputs and
 * anything marked data-keep are left alone. Translated strings are cached, here and on the server.
 */
const LANGS: [string, string][] = [
  ["en", "English"],
  ["ja", "日本語"],
  ["zh-CN", "中文"],
  ["ur", "اردو"],
  ["ar", "العربية"],
  ["ru", "Русский"],
  ["es", "Español"],
  ["fr", "Français"],
];
const KEY = "autofte-lang";
const original = new WeakMap<Text, string>();
const shown = new WeakMap<Text, string>(); // what we last wrote: anything else in the node is React's own new text
const cache = new Map<string, string>();
let current = "en";
let timer: number | null = null;
let observer: MutationObserver | null = null;
const listeners = new Set<(l: string) => void>();

const readLang = () => {
  try {
    return localStorage.getItem(KEY) || "en";
  } catch {
    return "en";
  }
};

function textNodes(): Text[] {
  const out: Text[] = [];
  const root = document.getElementById("root");
  if (!root) return out;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const t = (n.nodeValue ?? "").trim();
      if (t.length < 2 || !/\p{L}/u.test(t)) return NodeFilter.FILTER_REJECT;
      const el = n.parentElement;
      if (!el || el.closest("script,style,textarea,[data-keep],.notranslate")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walk.nextNode()) out.push(walk.currentNode as Text);
  return out;
}

const keyOf = (lang: string, text: string) => `${lang}|${text}`;

async function apply() {
  const lang = current;
  const nodes = textNodes();
  if (lang === "en") {
    for (const n of nodes) {
      const was = original.get(n);
      if (was !== undefined && n.nodeValue === shown.get(n)) n.nodeValue = was;
      shown.delete(n);
    }
    return;
  }
  const missing = new Set<string>();
  for (const n of nodes) {
    const was = original.get(n);
    // React rewrote the node: what is there now is the new original
    if (was === undefined || (n.nodeValue !== was && n.nodeValue !== shown.get(n))) original.set(n, n.nodeValue ?? "");
    const src = (original.get(n) ?? "").trim();
    if (src && !cache.has(keyOf(lang, src))) missing.add(src);
  }
  const batch = [...missing].filter((t) => t.length <= 160).slice(0, 60);
  if (batch.length) {
    try {
      const r = await api.post<{ texts: string[] }>("/api/public/translate", { lang, texts: batch });
      batch.forEach((t, i) => cache.set(keyOf(lang, t), r.texts[i] ?? t));
    } catch {
      batch.forEach((t) => cache.set(keyOf(lang, t), t));
    }
    if (current !== lang) return;
  }
  observer?.disconnect();
  for (const n of textNodes()) {
    const raw = original.get(n);
    const src = raw?.trim();
    const hit = src ? cache.get(keyOf(lang, src)) : undefined;
    if (raw && hit) {
      const next = raw.replace(src!, hit);
      if (n.nodeValue !== next) n.nodeValue = next;
      shown.set(n, next);
    }
  }
  watch();
  if (missing.size > batch.length) schedule(100); // the rest of a long page, a batch at a time
}

function schedule(ms = 400) {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => void apply(), ms);
}

function watch() {
  const root = document.getElementById("root");
  if (!root) return;
  observer ??= new MutationObserver(() => {
    if (current !== "en") schedule();
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
}

function choose(lang: string) {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* the choice just will not be remembered */
  }
  listeners.forEach((f) => f(lang));
  if (lang !== "en") watch();
  schedule(0);
}

/** On auction pages, carry on in the language chosen before. */
export function usePageLanguage() {
  useEffect(() => {
    const saved = readLang();
    if (saved !== "en") choose(saved);
    return () => {
      // leaving the auction: the rest of the site stays as it is
      observer?.disconnect();
      if (timer) window.clearTimeout(timer);
      current = "en";
    };
  }, []);
}

export function LanguagePicker() {
  const [lang, setLang] = useState(readLang);
  useEffect(() => {
    listeners.add(setLang);
    return () => void listeners.delete(setLang);
  }, []);
  return (
    <select aria-label="Language" data-keep className="notranslate h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-1.5 text-xs" value={lang} onChange={(e) => choose(e.target.value)}>
      {LANGS.map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}
