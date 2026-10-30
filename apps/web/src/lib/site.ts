import { useQuery } from "@tanstack/react-query";
import type { SiteSettings } from "@autofte/shared";
import { api } from "./api";

export function useSite() {
  const q = useQuery({ queryKey: ["site"], queryFn: () => api.get<{ site: SiteSettings; builtWith: string }>("/api/public/site"), staleTime: 5 * 60_000 });
  return q.data?.site;
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
