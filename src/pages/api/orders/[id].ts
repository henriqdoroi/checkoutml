import type { NextApiRequest, NextApiResponse } from "next";
import { publicOrder, refreshOrder } from "@/server/checkout";
import { deps } from "@/server/env";
import { onlyMethod, rateLimited, sendError } from "@/server/http";

/** Pedido público (tela do Pix / página do pedido). Consulta o provedor se pendente. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyMethod(req, res, "GET")) return;
  if (rateLimited(req, "order-get", 120, 60_000)) return res.status(429).json({ success: false, message: "Muitas consultas." });
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ success: false, message: "Pedido não encontrado." });
  try {
    const d = await deps();
    const o = await d.store.get(id);
    if (!o) return res.status(404).json({ success: false, message: "Pedido não encontrado." });
    const fresh = await refreshOrder(o, d);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: publicOrder(fresh, d.provider.demo) });
  } catch (e) {
    return sendError(res, e);
  }
}
