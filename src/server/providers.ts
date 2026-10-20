/**
 * Conector do provedor de Pix. Cada provedor implementa esta interface.
 * As chaves ficam SÓ em variáveis de ambiente do servidor.
 *
 * PIX_PROVIDER=demo     -> não cobra nada; código claramente de exemplo.
 * PIX_PROVIDER=flevopag -> FlevoPag (src/server/flevopag.ts).
 */

export type ChargeInput = {
  orderId: string;
  amountCents: number;
  description: string;
  expiresMinutes: number;
  buyer: { name: string; email: string | null; cpf: string | null; phone: string | null };
  /** o provedor deve repetir a mesma cobrança para a mesma chave */
  idempotencyKey: string;
  webhookUrl: string | null;
  address?: { street: string; number: string; complement: string | null; district: string; city: string; state: string; cep: string } | null;
  tracking?: Record<string, string>;
};

export type Charge = {
  chargeId: string;
  pixCode: string;
  pixQrImage: string | null; // data URL ou URL https, se o provedor mandar
  expiresAt: string | null;
};

export type ChargeStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

export interface PixProvider {
  readonly name: string;
  /** true = modo demonstração (nada é cobrado) */
  readonly demo: boolean;
  createCharge(input: ChargeInput): Promise<Charge>;
  /** consulta autenticada ao provedor */
  getStatus(chargeId: string): Promise<{ status: ChargeStatus; paidAt: string | null }>;
  /** lê o aviso do webhook: id do NOSSO pedido (reference) e/ou da cobrança. Não decide status. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<{ orderId: string | null; chargeId: string | null } | null>;
}

const demoProvider: PixProvider = {
  name: "demo",
  demo: true,
  async createCharge(input) {
    return {
      chargeId: `demo_${input.orderId}`,
      // Texto de exemplo — NÃO é um código Pix e não pode ser pago.
      pixCode: `EXEMPLO-MODO-DEMONSTRACAO-NAO-E-UM-CODIGO-PIX-${input.orderId.slice(0, 8).toUpperCase()}`,
      pixQrImage: null,
      expiresAt: new Date(Date.now() + input.expiresMinutes * 60_000).toISOString(),
    };
  },
  async getStatus() {
    return { status: "pending", paidAt: null };
  },
  async parseWebhook() {
    return null;
  },
};

import { flevoProvider } from "./flevopag.ts";

export function getProvider(): PixProvider {
  const name = (process.env.PIX_PROVIDER || "demo").trim().toLowerCase();
  switch (name) {
    case "demo":
      return demoProvider;
    case "flevopag": {
      const apiKey = process.env.FLEVOPAG_API_KEY?.trim();
      if (!apiKey) throw new Error("FLEVOPAG_API_KEY não configurada.");
      return flevoProvider({ apiKey, baseUrl: process.env.FLEVOPAG_API_URL });
    }
    default:
      throw new Error(`Provedor de Pix "${name}" não configurado neste site.`);
  }
}
