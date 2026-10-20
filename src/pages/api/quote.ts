import type { NextApiRequest, NextApiResponse } from "next";
import { findProduct } from "@/config/store";
import { quote } from "@/server/pricing";
import { onlyMethod, rateLimited } from "@/server/http";

/** Cotação: os MESMOS números que o pedido vai cobrar (valida o cupom). */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyMethod(req, res, "POST")) return;
  if (rateLimited(req, "quote", 60, 60_000)) return res.status(429).json({ success: false, message: "Muitas tentativas. Aguarde um pouco." });
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const product = findProduct(body.slug);
  if (!product) return res.status(404).json({ success: false, code: "product_not_found", message: "Produto não encontrado." });
  const r = quote(product, { bumpIds: body.bumpIds ?? [], couponCode: body.couponCode });
  if (!r.ok) return res.status(200).json({ success: false, code: r.code, message: r.message });
  const { items, ...view } = r.quote;
  return res.status(200).json({ success: true, data: view });
}
