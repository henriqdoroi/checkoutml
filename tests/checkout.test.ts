// node --test --experimental-strip-types tests/*.test.ts  (sem rede, sem banco)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { quote } from "../src/server/pricing.ts";
import { createOrder, publicOrder, refreshOrder } from "../src/server/checkout.ts";
import { memoryStore } from "../src/server/orders.ts";
import { flevoProvider, mapFlevoStatus, parseFlevoDate } from "../src/server/flevopag.ts";
import type { PixProvider } from "../src/server/providers.ts";
import type { StoreProduct } from "../src/config/store.ts";

const product: StoreProduct = {
  slug: "p",
  name: "Produto",
  priceCents: 49900,
  active: true,
  requireAddress: true,
  bumps: [{ id: "b", title: "Garantia", description: "x", priceCents: 3990 }],
};
const coupons = [
  { code: "DEZ", type: "percent" as const, value: 10, active: true },
  { code: "OFF", type: "percent" as const, value: 50, active: false },
];
const sum = (items: { priceCents: number; quantity: number }[]) => items.reduce((s, i) => s + i.priceCents * i.quantity, 0);

describe("preço", () => {
  test("cupom -> % Pix -> frete, itens somam o total", () => {
    const r = quote(product, { bumpIds: ["b"], couponCode: " dez " }, {
      pixDiscountPercent: 10,
      coupons,
      shipping: { mode: "fixed", priceCents: 1990, daysMin: 1, daysMax: 2, label: "Envio" },
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.quote.couponDiscountCents, 5389);
    assert.equal(r.quote.pixDiscountCents, 4850);
    assert.equal(r.quote.totalCents, 43651 + 1990);
    assert.equal(sum(r.quote.items), r.quote.totalCents);
  });
  test("cupom inativo ou inexistente recusado; adicional desconhecido recusado", () => {
    assert.equal(quote(product, { couponCode: "OFF" }, { coupons }).ok, false);
    assert.equal(quote(product, { couponCode: "NADA" }, { coupons }).ok, false);
    assert.equal(quote(product, { bumpIds: ["x"] }).ok, false);
  });
});

describe("FlevoPag", () => {
  test("status e data", () => {
    assert.equal(mapFlevoStatus("approved"), "paid");
    assert.equal(mapFlevoStatus("under_review"), "pending");
    assert.equal(mapFlevoStatus("failed"), "failed");
    assert.equal(mapFlevoStatus("chargeback"), "refunded");
    assert.equal(parseFlevoDate("2025-08-22 21:30:00"), "2025-08-23T00:30:00.000Z");
  });

  test("cria transação com a chave no cabeçalho e o corpo da documentação", async () => {
    const calls: { url: string; init: any }[] = [];
    const fake = (async (url: string, init: any) => {
      calls.push({ url, init });
      if (init.method === "POST")
        return new Response(JSON.stringify({ status: "success", transaction_id: 238, id: "ref", qr_code: "000201TESTE", qr_code_base64: "iVBOR", expires_at: "2025-08-22 21:30:00" }));
      return new Response(JSON.stringify({ id: 238, status: "approved", updated_at: "2025-08-22 21:00:00" }));
    }) as unknown as typeof fetch;
    const p = flevoProvider({ apiKey: "chave-teste", baseUrl: "https://flevo.test", fetchImpl: fake });
    const c = await p.createCharge({
      orderId: "11111111-1111-1111-1111-111111111111",
      amountCents: 1000,
      description: "Produto",
      expiresMinutes: 30,
      buyer: { name: "Ana Teste", email: "ana@example.test", cpf: "52998224725", phone: "11912345678" },
      idempotencyKey: "k",
      webhookUrl: "https://site.test/api/webhooks/pix?token=t",
      address: { street: "Rua A", number: "1", complement: null, district: "Centro", city: "Cidade", state: "SP", cep: "01001000" },
      tracking: { utm_source: "meta" },
    });
    assert.equal(calls[0]!.url, "https://flevo.test/api/v1/transaction");
    assert.equal(calls[0]!.init.headers["X-API-Key"], "chave-teste");
    const body = JSON.parse(calls[0]!.init.body);
    assert.equal(body.amount, 1000);
    assert.equal(body.reference, "11111111-1111-1111-1111-111111111111");
    assert.equal(body.source, "api_externa");
    assert.equal(body.customer.document, "52998224725");
    assert.equal(body.address.neighborhood, "Centro");
    assert.equal(body.address.zipcode, "01001000");
    assert.equal(body.postback_url, "https://site.test/api/webhooks/pix?token=t");
    assert.deepEqual(body.tracking, { utm_source: "meta" });
    assert.equal(c.chargeId, "238");
    assert.equal(c.pixCode, "000201TESTE");
    assert.equal(c.pixQrImage, "data:image/png;base64,iVBOR");
    const st = await p.getStatus("238");
    assert.equal(calls[1]!.url, "https://flevo.test/api/v1/query?action=get_transaction&id=238");
    assert.equal(st.status, "paid");
  });

  test("webhook só identifica o pedido (não decide status)", async () => {
    const p = flevoProvider({ apiKey: "k" });
    assert.deepEqual(await p.parseWebhook({}, JSON.stringify({ external_id: "abc", transaction_id: "FLV1", status: "approved" })), {
      orderId: "abc",
      chargeId: "FLV1",
    });
    assert.equal(await p.parseWebhook({}, "lixo"), null);
  });
});

describe("pedido", () => {
  const buyer = { name: "Ana Teste", email: "ana@example.test", document: "52998224725", phone: "11912345678" };
  const addr = { recipient: "Ana Teste", cep: "01001-000", street: "Praça da Sé", number: "1", district: "Sé", city: "São Paulo", state: "SP" };
  let charges = 0;
  let remote: "pending" | "paid" = "pending";
  const fakeProvider: PixProvider = {
    name: "fake",
    demo: false,
    async createCharge(i) {
      charges++;
      return { chargeId: `c_${i.orderId}`, pixCode: "PIX-TESTE", pixQrImage: null, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    },
    async getStatus() {
      return { status: remote, paidAt: remote === "paid" ? new Date().toISOString() : null };
    },
    async parseWebhook() {
      return null;
    },
  };

  test("valor do servidor, idempotência, sem dados pessoais no público, status pela consulta", async () => {
    const store = memoryStore();
    const deps = { store, provider: fakeProvider, baseUrl: "https://site.test", webhookSecret: "s" };
    const body = { slug: "produto-exemplo", bumpIds: [], ...buyer, shippingAddress: addr, checkoutKey: "chave-de-teste-123456", totalCents: 1 };
    const o1 = await createOrder(body, deps);
    const o2 = await createOrder(body, deps);
    assert.equal(o1.id, o2.id);
    assert.equal(charges, 1);
    assert.ok(o1.totalCents > 100);
    const pub = JSON.stringify(publicOrder(o1, false));
    assert.ok(!pub.includes("Praça") && !pub.includes("52998224725") && !pub.includes("ana@example.test"));

    remote = "paid";
    const fresh = await refreshOrder(o1, deps, true);
    assert.equal(fresh.status, "paid");
  });

  test("sem endereço / CPF inválido são recusados", async () => {
    const deps = { store: memoryStore(), provider: fakeProvider, baseUrl: null, webhookSecret: null };
    await assert.rejects(createOrder({ slug: "produto-exemplo", ...buyer }, deps), /CEP/);
    await assert.rejects(createOrder({ slug: "produto-exemplo", ...buyer, document: "11111111111", shippingAddress: addr }, deps), /CPF/);
  });
});
