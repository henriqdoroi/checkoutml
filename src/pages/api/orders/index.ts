import type { NextApiRequest, NextApiResponse } from "next";
import { createOrder, publicOrder } from "@/server/checkout";
import { deps } from "@/server/env";
import { onlyMethod, rateLimited, sendError } from "@/server/http";

/** Cria o pedido + cobrança Pix. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyMethod(req, res, "POST")) return;
  if (rateLimited(req, "orders", 10, 60_000)) return res.status(429).json({ success: false, message: "Muitas tentativas. Aguarde um minuto." });
  try {
    const d = await deps();
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const order = await createOrder(body, d);
    return res.status(200).json({ success: true, data: publicOrder(order, d.provider.demo) });
  } catch (e) {
    return sendError(res, e);
  }
}
