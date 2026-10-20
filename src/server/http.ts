import type { NextApiRequest, NextApiResponse } from "next";
import { CheckoutError } from "./checkout.ts";

/** Limite simples por IP (por instância) contra abuso das rotas públicas. */
const hits = new Map<string, number[]>();
export function rateLimited(req: NextApiRequest, bucket: string, max: number, windowMs: number): boolean {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0]!.trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 10_000) hits.clear();
  return list.length > max;
}

export function sendError(res: NextApiResponse, e: unknown) {
  if (e instanceof CheckoutError) {
    return res.status(e.status).json({ success: false, code: e.code, message: e.message });
  }
  console.error("[checkout]", e);
  const msg = e instanceof Error && /FLEVOPAG|DATABASE_URL|Provedor/.test(e.message) ? "Pagamento indisponível no momento." : "Erro inesperado. Tente de novo.";
  return res.status(500).json({ success: false, code: "server_error", message: msg });
}

export function onlyMethod(req: NextApiRequest, res: NextApiResponse, method: string): boolean {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  res.status(405).json({ success: false, message: "Método não permitido." });
  return false;
}
