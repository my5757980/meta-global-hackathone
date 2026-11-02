import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "../ui";

interface Credit {
  file: string;
  model: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}

/** Who took the car photos, and the free licence each one is used under. */
export default function Credits() {
  const q = useQuery({ queryKey: ["photo-credits"], queryFn: async () => (await fetch("/cars/credits.json")).json() as Promise<Credit[]>, staleTime: 3600_000 });
  return (
    <div className="container-page max-w-4xl py-10">
      <h1 className="text-3xl font-bold text-slate-900">Photo credits</h1>
      <p className="mt-2 text-slate-600">The car photos on this demo are real photos of each model, used under free licences from Wikimedia Commons. They show the model, not the exact car on sale, so the colour can differ. Photos were resized only.</p>
      {q.isLoading ? (
        <Skeleton className="mt-6 h-64" />
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {q.data?.map((c) => (
            <Card key={c.file} padded={false} className="flex gap-3 overflow-hidden p-3">
              <img src={`/cars/${c.file}`} alt={c.model} loading="lazy" className="h-20 w-28 shrink-0 rounded-lg bg-slate-100 object-cover" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-slate-900">{c.model}</p>
                <p className="break-words text-slate-600">Photo: {c.author}</p>
                <p className="text-slate-600">
                  <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{c.license}</a>
                  {" · "}
                  <a href={c.source} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Source</a>
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
