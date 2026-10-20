/**
 * Configuração da loja — edite aqui produtos, preços, frete e cupons.
 * Este arquivo só é lido no SERVIDOR: os cupons nunca chegam ao navegador e
 * o preço cobrado sempre sai daqui (nunca do que o navegador manda).
 * Valores em CENTAVOS.
 */

import { BRAND } from "./brand.ts";

export type StoreBump = { id: string; title: string; description: string; priceCents: number };

export type StoreProduct = {
  slug: string; // vira o link: /checkout/<slug>
  name: string;
  priceCents: number;
  imageUrl?: string; // caminho em /public ou URL https
  tag?: string; // etiqueta acima do nome (ex.: "Lançamento")
  variant?: string; // ex.: "Cor: Preto"
  active: boolean;
  bumps?: StoreBump[];
  /** pede endereço de entrega (produto físico) */
  requireAddress: boolean;
};

export type StoreCoupon = { code: string; type: "percent" | "fixed"; value: number; active: boolean };

export const STORE = {
  /** nome e cor: edite em src/config/brand.ts */
  name: BRAND.name,
  /** título da barra do topo do checkout */
  checkoutTitle: "Finalize sua compra",
  brandColor: BRAND.color,
  /** desconto no Pix, em % (0 = sem desconto) */
  pixDiscountPercent: 10,
  /** dados pedidos no faturamento */
  fields: { nome: true, email: true, cpf: true, celular: true },
  shipping: {
    mode: "free" as "free" | "fixed",
    priceCents: 0,
    daysMin: 4,
    daysMax: 8,
    label: "Envio padrão",
  },
  /** cupons (só o servidor conhece) — value: % (percent) ou centavos (fixed) */
  coupons: [
    { code: "BEMVINDO10", type: "percent", value: 10, active: true },
  ] as StoreCoupon[],
  /** minutos para o Pix expirar */
  pixExpiresMinutes: 30,
  supportEmail: "",
  products: [
    {
      slug: "produto-exemplo",
      name: "Produto de exemplo",
      priceCents: 19990,
      tag: "Exemplo",
      variant: "Edite em src/config/store.ts",
      active: true,
      requireAddress: true,
      bumps: [
        {
          id: "garantia",
          title: "Garantia estendida 12 meses",
          description: "Cobertura extra contra defeitos.",
          priceCents: 2990,
        },
      ],
    },
  ] as StoreProduct[],
};

export function findProduct(slug: unknown): StoreProduct | null {
  if (typeof slug !== "string") return null;
  return STORE.products.find((p) => p.slug === slug && p.active) ?? null;
}
