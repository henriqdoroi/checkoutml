import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { refreshOrder } from "@/server/checkout";
import { deps } from "@/server/env";

export const config = { api: { bodyParser: false } };

async function rawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 256 * 1024) throw new Error("payload grande demais");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Aviso do provedor. O conteúdo NÃO é confiável (a FlevoPag não assina):
 * só usamos pra achar o pedido e então consultamos o status na API.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const d = await deps();
    const expected = d.webhookSecret;
    const got = typeof req.query.token === "string" ? req.query.token : "";
    if (!expected || !sameToken(got, expected)) return res.status(401).json({ ok: false });

    const body = await rawBody(req);
    const ref = await d.provider.parseWebhook(req.headers, body);
    if (!ref) return res.status(200).json({ ok: true, ignored: true });

    let order = ref.orderId && /^[0-9a-f-]{36}$/i.test(ref.orderId) ? await d.store.get(ref.orderId) : null;
    if (!order && ref.chargeId) order = await d.store.findByCharge(d.provider.name, ref.chargeId);
    if (!order) return res.status(200).json({ ok: true, ignored: true });

    await refreshOrder(order, d, true);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[webhook]", e);
    return res.status(500).json({ ok: false });
  }
}
