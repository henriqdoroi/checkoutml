import { getProvider } from "./providers.ts";
import { orderStore } from "./orders.ts";

/** Dependências do servidor a partir das variáveis de ambiente. */
export async function deps() {
  const provider = getProvider();
  if (!provider.demo && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL é obrigatória para cobrar de verdade (os pedidos precisam ser guardados).");
  }
  return {
    provider,
    store: await orderStore(),
    baseUrl: process.env.PUBLIC_BASE_URL?.trim() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null),
    webhookSecret: process.env.PIX_WEBHOOK_SECRET?.trim() || null,
  };
}

export function isDemo(): boolean {
  try {
    return getProvider().demo;
  } catch {
    return false;
  }
}
