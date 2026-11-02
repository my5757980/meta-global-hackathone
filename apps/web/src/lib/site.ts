import { createElement, Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SiteSettings } from "@autofte/shared";
import { api } from "./api";

export function useSite() {
  const q = useQuery({ queryKey: ["site"], queryFn: () => api.get<{ site: SiteSettings; builtWith: string }>("/api/public/site"), staleTime: 5 * 60_000 });
  return q.data?.site;
}

/** The AI employee's name and the company's name come from Site Settings, in text as much as in the prompts. */
export const useFte = () => useSite()?.ftEName ?? "Sora";
export const FteName = () => createElement(Fragment, null, useFte());
export const CompanyName = () => createElement(Fragment, null, useSite()?.companyName ?? "");

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
function mix(hex: string, target: number, amount: number): string {
  const c = [0, 1, 2].map((i) => Math.round(channel(hex, i) + (target - channel(hex, i)) * amount));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
const BRAND_STEPS: [string, number, number][] = [
  ["50", 255, 0.93],
  ["100", 255, 0.84],
  ["200", 255, 0.66],
  ["300", 255, 0.46],
  ["400", 255, 0.26],
  ["500", 255, 0.1],
  ["600", 0, 0],
  ["700", 0, 0.18],
  ["800", 0, 0.34],
  ["900", 0, 0.52],
];
const ACCENT_STEPS: [string, number, number][] = [
  ["400", 255, 0.2],
  ["500", 0, 0],
  ["600", 0, 0.14],
];
const isHex = (x?: string): x is string => !!x && /^#[0-9a-fA-F]{6}$/.test(x);

/** Branding from Site Settings reaches every page: colours (the theme's own variables), browser tab title, favicon. */
export function useBrandTheme() {
  const site = useSite();
  useEffect(() => {
    if (!site) return;
    document.title = `${site.companyName} — ${site.tagline}`;
    const root = document.documentElement.style;
    // the demo's own colours keep the hand-tuned scale in index.css
    const paint = (name: string, steps: [string, number, number][], base: string | undefined, builtIn: string) => {
      for (const [step, target, amount] of steps) {
        if (isHex(base) && base.toLowerCase() !== builtIn) root.setProperty(`--color-${name}-${step}`, mix(base, target, amount));
        else root.removeProperty(`--color-${name}-${step}`);
      }
    };
    paint("brand", BRAND_STEPS, site.primaryColor, "#0f4c81");
    paint("accent", ACCENT_STEPS, site.accentColor, "#f59e0b");
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = site.logoUrl || "/favicon.svg";
  }, [site]);
}

export interface VehicleCard {
  id: string;
  slug: string;
  stockNo: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  mileageKm: number;
  priceUsd: number;
  discountPriceUsd: number | null;
  fuel: string;
  transmission: string;
  bodyType: string;
  engineCc: number | null;
  color: string;
  drive: string;
  status: string;
  image: string;
  location?: string;
}
