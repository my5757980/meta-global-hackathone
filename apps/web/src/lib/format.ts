export const usd = (n: number | string | null | undefined, digits = 0) =>
  n == null || n === "" ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: 2 });

export const usd2 = (n: number | string | null | undefined) => usd(n, 2);

export const jpy = (n: number | null | undefined) => (n == null ? "—" : "¥" + Math.round(n).toLocaleString("en-US"));

export const km = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toLocaleString("en-US")} km`);

export const date = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const time = (d: string | Date) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function ago(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const initials = (name?: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Tiny, safe markdown: **bold**, line breaks, bullet lines, ### headings, links. Escapes everything else. */
export function miniMarkdown(src: string): string {
  const esc = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc.split(/\r?\n/);
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const inline = (t: string) =>
    t
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((\/[^\s)]*|https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
      // a bare web address is a link too (never one already inside an <a>, which follows a quote or a ">")
      .replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<)]+)/g, (_m, lead: string, url: string) => {
        const tail = url.match(/[.,!?:;]+$/)?.[0] ?? "";
        const bare = tail ? url.slice(0, -tail.length) : url;
        return `${lead}<a href="${bare.startsWith("www.") ? `https://${bare}` : bare}" target="_blank" rel="noopener noreferrer">${bare}</a>${tail}`;
      });
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) {
        if (list) out.push(`</${list}>`);
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1]!)}</li>`);
      continue;
    }
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
    if (/^###\s+/.test(line)) out.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`);
    else if (line.trim() === "") out.push("");
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join("\n");
}
