/**
 * Fluxo do pedido no servidor:
 *  1. recalcula o preço (src/server/pricing.ts) — o total do navegador não vale;
 *  2. grava o pedido (chave de idempotência: o mesmo clique não duplica);
 *  3. cria a cobrança Pix no provedor e guarda o código;
 *  4. status só muda pela consulta autenticada ao provedor (webhook = aviso).
 */
import { STORE, findProduct } from "../config/store.ts";
import { quote } from "./pricing.ts";
import { parseAddress, parseBuyer } from "./validate.ts";
import { type Order, type OrderStore, newOrderId } from "./orders.ts";
import type { PixProvider } from "./providers.ts";

export class CheckoutError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck"];

function tracking(v: unknown): Record<string, string> {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const k of TRACKING_KEYS) {
    const s = typeof o[k] === "string" ? (o[k] as string).trim().slice(0, 200) : "";
    if (s) out[k] = s;
  }
  return out;
}

export async function createOrder(
  body: Record<string, unknown>,
  deps: { store: OrderStore; provider: PixProvider; baseUrl: string | null; webhookSecret: string | null },
): Promise<Order> {
  const product = findProduct(body.slug);
  if (!product) throw new CheckoutError("Produto não encontrado.", "product_not_found", 404);

  const priced = quote(product, { bumpIds: body.bumpIds ?? [], couponCode: body.couponCode });
  if (!priced.ok) throw new CheckoutError(priced.message, priced.code);
  const q = priced.quote;
  if (q.totalCents < 100) throw new CheckoutError("Valor mínimo para Pix é R$ 1,00.", "amount_too_low");

  let address = null;
  if (product.requireAddress) {
    const a = parseAddress(body.shippingAddress);
    if (!a.ok) throw new CheckoutError(a.message, "address_invalid");
    address = a.address;
  }
  // FlevoPag exige nome, e-mail, documento e telefone do pagador.
  const fields = deps.provider.demo ? STORE.fields : { nome: true, email: true, cpf: true, celular: true };
  const b = parseBuyer(body, fields, address?.recipient ?? "");
  if (!b.ok) throw new CheckoutError(b.message, "buyer_invalid");

  const rawKey = typeof body.checkoutKey === "string" ? body.checkoutKey.trim() : "";
  const key = /^[A-Za-z0-9-]{16,64}$/.test(rawKey) ? `${product.slug}:${rawKey}` : null;
  if (key) {
    const prev = await deps.store.getByKey(key);
    if (prev) return prev;
  }

  const draft: Order = {
    id: newOrderId(),
    idempotencyKey: key,
    productSlug: product.slug,
    productName: product.name,
    status: "pending",
    totalCents: q.totalCents,
    items: q.items,
    couponCode: q.coupon?.code ?? null,
    buyer: b.buyer,
    address,
    provider: deps.provider.name,
    chargeId: null,
    pixCode: null,
    pixQrImage: null,
    expiresAt: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  };
  const order = await deps.store.insert(draft);
  if (order.id !== draft.id) return order; // corrida: outro envio com a mesma chave chegou antes

  const webhookUrl =
    deps.baseUrl && !deps.provider.demo
      ? `${deps.baseUrl.replace(/\/+$/, "")}/api/webhooks/pix${deps.webhookSecret ? `?token=${encodeURIComponent(deps.webhookSecret)}` : ""}`
      : null;
  try {
    const charge = await deps.provider.createCharge({
      orderId: order.id,
      amountCents: order.totalCents,
      description: product.name,
      expiresMinutes: STORE.pixExpiresMinutes,
      buyer: order.buyer,
      idempotencyKey: order.id,
      webhookUrl,
      address,
      tracking: tracking(body.tracking),
    });
    return (await deps.store.update(order.id, {
      chargeId: charge.chargeId,
      pixCode: charge.pixCode,
      pixQrImage: charge.pixQrImage,
      expiresAt: charge.expiresAt,
    }))!;
  } catch (e: any) {
    await deps.store.update(order.id, { status: "failed" });
    throw new CheckoutError(e?.message || "Não foi possível gerar o Pix. Tente de novo.", "charge_failed", 502);
  }
}

const lastCheck = new Map<string, number>();

/** Atualiza o status pelo provedor (no máximo 1 consulta a cada 10s por pedido). */
export async function refreshOrder(order: Order, deps: { store: OrderStore; provider: PixProvider }, force = false): Promise<Order> {
  if (order.status !== "pending" || !order.chargeId || deps.provider.demo || deps.provider.name !== order.provider) return order;
  const now = Date.now();
  if (!force && now - (lastCheck.get(order.id) ?? 0) < 10_000) return order;
  lastCheck.set(order.id, now);
  if (lastCheck.size > 5000) for (const [k, v] of lastCheck) if (now - v > 60_000) lastCheck.delete(k);
  try {
    const s = await deps.provider.getStatus(order.chargeId);
    if (s.status !== order.status) {
      return (await deps.store.update(order.id, { status: s.status, paidAt: s.paidAt })) ?? order;
    }
  } catch {
    /* provedor fora: mostra o que tem */
  }
  return order;
}

/** O que o link público do pedido mostra — sem rua, CPF, e-mail ou telefone. */
export function publicOrder(o: Order, demo: boolean) {
  const expired = o.status === "pending" && !!o.expiresAt && new Date(o.expiresAt).getTime() < Date.now();
  return {
    id: o.id,
    status: expired ? "expired" : o.status,
    demo,
    productSlug: o.productSlug,
    productName: o.productName,
    totalCents: o.totalCents,
    items: o.items.map((i) => ({ name: i.name, kind: i.kind, priceCents: i.priceCents, quantity: i.quantity })),
    pixCode: o.status === "pending" && !expired ? o.pixCode : null,
    pixQrImage: o.status === "pending" && !expired ? o.pixQrImage : null,
    expiresAt: o.expiresAt,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    delivery: o.address
      ? { city: o.address.city, state: o.address.state, daysMin: STORE.shipping.daysMin, daysMax: STORE.shipping.daysMax }
      : null,
  };
}
export type PublicOrder = ReturnType<typeof publicOrder>;
