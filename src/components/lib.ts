/**
 * Lado do navegador: formatação, máscaras e chamadas às rotas /api do site.
 * Os VALORES cobrados vêm sempre do servidor; aqui só se formata.
 */
import type { PublicOrder } from "@/server/checkout";

export type { PublicOrder };

export type Quote = {
  subtotalCents: number;
  couponDiscountCents: number;
  pixDiscountCents: number;
  pixDiscountPercent: number;
  shippingCents: number;
  totalCents: number;
  coupon: { code: string; type: "percent" | "fixed"; value: number } | null;
};

export type Address = {
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

export type Billing = { name: string; email: string; cpf: string; phone: string };

/** Dados públicos da loja/produto que a página recebe do servidor (sem cupons). */
export type PublicCheckout = {
  demo: boolean;
  store: {
    name: string;
    title: string;
    brandColor: string;
    pixDiscountPercent: number;
    couponsEnabled: boolean;
    fields: { nome: boolean; email: boolean; cpf: boolean; celular: boolean };
    shipping: { mode: "free" | "fixed"; priceCents: number; daysMin: number; daysMax: number; label: string };
  };
  product: {
    slug: string;
    name: string;
    priceCents: number;
    imageUrl: string | null;
    tag: string | null;
    variant: string | null;
    requireAddress: boolean;
    bumps: { id: string; title: string; description: string; priceCents: number }[];
  };
};

/* ---------------- dinheiro / datas ---------------- */

export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function moneyParts(cents: number): { int: string; dec: string } {
  const c = Math.max(0, Math.round(cents));
  return { int: `R$ ${Math.floor(c / 100).toLocaleString("pt-BR")}`, dec: String(c % 100).padStart(2, "0") };
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function deliveryWindow(daysMin: number, daysMax: number, from = new Date()): string {
  const a = new Date(from);
  a.setDate(a.getDate() + daysMin);
  const b = new Date(from);
  b.setDate(b.getDate() + daysMax);
  if (daysMin === daysMax) return `Chegará em ${b.getDate()}/${MONTHS[b.getMonth()]}`;
  const first = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()}/${MONTHS[a.getMonth()]}`;
  return `Chegará entre ${first} e ${b.getDate()}/${MONTHS[b.getMonth()]}`;
}

/* ---------------- máscaras ---------------- */

export const digits = (v: string) => v.replace(/\D/g, "");

export function maskCep(v: string): string {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function maskCpf(v: string): string {
  return digits(v)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function maskPhone(v: string): string {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidCpf(v: string): boolean {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function cpfHint(v: string): string {
  const d = digits(v);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "";
}

export function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1] ?? "", 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.45 ? "rgba(0,0,0,0.88)" : "#ffffff";
}

export function newCheckoutKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

/* ---------------- API ---------------- */

export const OFFLINE_MSG = "Sem conexão. Verifique sua internet e tente de novo.";

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  } catch {
    throw new ApiError(OFFLINE_MSG, "offline");
  }
  let j: any = null;
  try {
    j = await r.json();
  } catch {
    throw new ApiError(r.status >= 500 ? "Servidor indisponível. Tente de novo." : fallback, "bad_response");
  }
  if (!r.ok || j?.success === false) throw new ApiError(j?.message || fallback, j?.code);
  return j.data as T;
}

export const fetchQuote = (body: { slug: string; bumpIds: string[]; couponCode?: string | null }) =>
  call<Quote>("/api/quote", { method: "POST", body: JSON.stringify(body) }, "Não foi possível calcular o total.");

export const createOrder = (body: Record<string, unknown>) =>
  call<PublicOrder>("/api/orders", { method: "POST", body: JSON.stringify(body) }, "Não foi possível gerar o Pix. Tente de novo.");

export const fetchOrder = (id: string) =>
  call<PublicOrder>(`/api/orders/${encodeURIComponent(id)}`, { method: "GET", cache: "no-store" }, "Pedido não encontrado.");

/** Endereço pelo CEP (ViaCEP). Falhou? O comprador digita à mão. */
export async function lookupCep(cep: string): Promise<Partial<Address> | null> {
  const d = digits(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.erro) return null;
    return { street: j.logradouro || "", district: j.bairro || "", city: j.localidade || "", state: j.uf || "" };
  } catch {
    return null;
  }
}

/** UTMs da URL (repassadas ao provedor para rastreamento). */
export function readTracking(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck"]) {
    const v = q.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}
