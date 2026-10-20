/**
 * FlevoPag (Pix) — https://app.flevopag.com/documentation
 *
 *  - POST /api/v1/transaction                       cria a cobrança (X-API-Key)
 *  - GET  /api/v1/query?action=get_transaction&id=  consulta o status
 *  - webhook (postback_url) avisa mudança de status
 *
 * O webhook da FlevoPag NÃO é assinado. Por isso ele só serve de "aviso":
 * o status real é sempre consultado na API com a chave secreta. A URL do
 * webhook ainda leva um token próprio (PIX_WEBHOOK_SECRET) pra descartar lixo.
 *
 * Variáveis: FLEVOPAG_API_KEY (obrigatória), FLEVOPAG_API_URL (opcional).
 */
import type { Charge, ChargeInput, ChargeStatus, PixProvider } from "./providers.ts";

const DEFAULT_URL = "https://pagamento-processador.org.ua";

export function mapFlevoStatus(s: unknown): ChargeStatus {
  switch (String(s ?? "").toLowerCase()) {
    case "approved":
    case "paid":
      return "paid";
    case "failed":
    case "canceled":
    case "cancelled":
      return "failed";
    case "expired":
      return "expired";
    case "refunded":
    case "chargeback":
      return "refunded";
    default:
      return "pending"; // pending, processing, under_review
  }
}

/** "2025-08-22 21:30:00" (horário de Brasília) -> ISO */
export function parseFlevoDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const d = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? new Date(s) : new Date(`${s.replace(" ", "T")}-03:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

type FetchLike = typeof fetch;

export function flevoProvider(opts: { apiKey: string; baseUrl?: string; fetchImpl?: FetchLike }): PixProvider {
  const base = (opts.baseUrl || DEFAULT_URL).replace(/\/+$/, "");
  const f = opts.fetchImpl ?? fetch;
  const headers = { "X-API-Key": opts.apiKey, "Content-Type": "application/json", Accept: "application/json" };

  async function call(method: string, path: string, body?: unknown) {
    let r: Response;
    try {
      r = await f(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new Error("Não foi possível falar com o provedor de pagamento. Tente de novo.");
    }
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* resposta não-JSON */
    }
    if (!r.ok) {
      const msg = json?.message || json?.error || `Provedor respondeu ${r.status}.`;
      throw new Error(r.status === 401 ? "Chave da FlevoPag inválida ou loja inativa." : String(msg).slice(0, 200));
    }
    return json;
  }

  return {
    name: "flevopag",
    demo: false,

    async createCharge(input: ChargeInput): Promise<Charge> {
      const a = input.address;
      const body: Record<string, unknown> = {
        amount: input.amountCents,
        description: input.description.slice(0, 120),
        reference: input.orderId, // nosso id do pedido (único)
        source: "api_externa",
        customer: {
          name: input.buyer.name,
          email: input.buyer.email,
          document: input.buyer.cpf,
          phone: input.buyer.phone,
        },
      };
      if (input.webhookUrl) body.postback_url = input.webhookUrl;
      if (a) {
        body.address = {
          street: a.street,
          number: a.number,
          complement: a.complement || undefined,
          neighborhood: a.district,
          city: a.city,
          state: a.state,
          zipcode: a.cep,
        };
      }
      if (input.tracking && Object.keys(input.tracking).length) body.tracking = input.tracking;

      const j = await call("POST", "/api/v1/transaction", body);
      const chargeId = j?.transaction_id ?? j?.id;
      if (!j || (j.status && String(j.status).toLowerCase() !== "success") || chargeId == null || !j.qr_code) {
        throw new Error(j?.message ? String(j.message).slice(0, 200) : "O provedor não gerou o Pix. Tente de novo.");
      }
      const img = typeof j.qr_code_base64 === "string" && j.qr_code_base64 ? j.qr_code_base64 : null;
      return {
        chargeId: String(chargeId),
        pixCode: String(j.qr_code),
        pixQrImage: img && !img.startsWith("data:") ? `data:image/png;base64,${img}` : img,
        expiresAt: parseFlevoDate(j.expires_at),
      };
    },

    async getStatus(chargeId: string) {
      const j = await call("GET", `/api/v1/query?action=get_transaction&id=${encodeURIComponent(chargeId)}`);
      const status = mapFlevoStatus(j?.status);
      return { status, paidAt: status === "paid" ? parseFlevoDate(j?.updated_at) ?? new Date().toISOString() : null };
    },

    // Sem assinatura: só identifica o pedido; quem decide é a consulta à API.
    async parseWebhook(_headers, rawBody) {
      try {
        const j = JSON.parse(rawBody);
        const ref = j?.external_id ?? j?.store_reference;
        const id = j?.transaction_id;
        if (ref == null && id == null) return null;
        return {
          orderId: ref == null ? null : String(ref).slice(0, 80),
          chargeId: id == null ? null : String(id).slice(0, 80),
        };
      } catch {
        return null;
      }
    },
  };
}
