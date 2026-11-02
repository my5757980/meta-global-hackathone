import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const bad = (m: string, d?: unknown) => new HttpError(400, m, d);
export const forbidden = (m = "You do not have permission to do this") => new HttpError(403, m);
export const notFound = (m = "Not found") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wrap an async route so thrown errors reach the error middleware; a returned value is sent as JSON. */
export const h =
  (fn: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = await fn(req, res, next);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) {
      next(e);
    }
  };

export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw bad(first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input", r.error.issues);
  }
  return r.data;
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if ((err as { name?: string }).name === "MulterError") {
    const code = (err as { code?: string }).code;
    res.status(400).json({ error: code === "LIMIT_FILE_SIZE" ? "That file is too large" : code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE" ? "Too many files at once" : "That upload could not be read" });
    return;
  }
  // a cut-off or broken upload is the sender's connection, not a fault here
  if (/^(Unexpected end of form|Multipart: Boundary not found|Malformed part header)/.test(String((err as Error)?.message))) {
    res.status(400).json({ error: "The upload did not arrive whole. Please try again." });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
}

export const page = (q: Record<string, unknown>, def = 20, max = 100) => {
  const pageNo = Math.max(1, Number(q.page) || 1);
  const size = Math.min(max, Math.max(1, Number(q.pageSize) || def));
  return { page: pageNo, pageSize: size, offset: (pageNo - 1) * size };
};
