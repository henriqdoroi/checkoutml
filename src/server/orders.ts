/**
 * Pedidos. Com DATABASE_URL: Postgres (tabela criada sozinha no 1º uso).
 * Sem DATABASE_URL: memória — só para o modo demonstração/desenvolvimento
 * (some ao reiniciar; em produção real o banco é obrigatório).
 */
import crypto from "node:crypto";
import type { OrderItem } from "./pricing.ts";
import type { Buyer, ShippingAddress } from "./validate.ts";

export type OrderStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

export type Order = {
  id: string;
  idempotencyKey: string | null;
  productSlug: string;
  productName: string;
  status: OrderStatus;
  totalCents: number;
  items: OrderItem[];
  couponCode: string | null;
  buyer: Buyer;
  address: ShippingAddress | null;
  provider: string;
  chargeId: string | null;
  pixCode: string | null;
  pixQrImage: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export interface OrderStore {
  get(id: string): Promise<Order | null>;
  getByKey(key: string): Promise<Order | null>;
  /** insere; se a chave de idempotência já existe, devolve o pedido existente */
  insert(o: Order): Promise<Order>;
  update(id: string, patch: Partial<Order>): Promise<Order | null>;
  findByCharge(provider: string, chargeId: string): Promise<Order | null>;
}

export const newOrderId = () => crypto.randomUUID();

/* ---------------- memória ---------------- */

class MemoryStore implements OrderStore {
  private rows = new Map<string, Order>();
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async getByKey(key: string) {
    for (const o of this.rows.values()) if (o.idempotencyKey === key) return o;
    return null;
  }
  async insert(o: Order) {
    if (o.idempotencyKey) {
      const prev = await this.getByKey(o.idempotencyKey);
      if (prev) return prev;
    }
    this.rows.set(o.id, o);
    return o;
  }
  async update(id: string, patch: Partial<Order>) {
    const o = this.rows.get(id);
    if (!o) return null;
    const n = { ...o, ...patch };
    this.rows.set(id, n);
    return n;
  }
  async findByCharge(provider: string, chargeId: string) {
    for (const o of this.rows.values()) if (o.provider === provider && o.chargeId === chargeId) return o;
    return null;
  }
}

/* ---------------- Postgres ---------------- */

const DDL = `
CREATE TABLE IF NOT EXISTS checkout_orders (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  product_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  items JSONB NOT NULL,
  coupon_code TEXT,
  buyer JSONB NOT NULL,
  address JSONB,
  provider TEXT NOT NULL,
  charge_id TEXT,
  pix_code TEXT,
  pix_qr_image TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkout_orders_charge_idx ON checkout_orders (provider, charge_id);
`;

type Row = Record<string, any>;
const iso = (v: any) => (v ? new Date(v).toISOString() : null);
const fromRow = (r: Row): Order => ({
  id: r.id,
  idempotencyKey: r.idempotency_key,
  productSlug: r.product_slug,
  productName: r.product_name,
  status: r.status,
  totalCents: Number(r.total_cents),
  items: r.items,
  couponCode: r.coupon_code,
  buyer: r.buyer,
  address: r.address,
  provider: r.provider,
  chargeId: r.charge_id,
  pixCode: r.pix_code,
  pixQrImage: r.pix_qr_image,
  expiresAt: iso(r.expires_at),
  paidAt: iso(r.paid_at),
  createdAt: iso(r.created_at)!,
});
const COLS: Record<keyof Order, string> = {
  id: "id",
  idempotencyKey: "idempotency_key",
  productSlug: "product_slug",
  productName: "product_name",
  status: "status",
  totalCents: "total_cents",
  items: "items",
  couponCode: "coupon_code",
  buyer: "buyer",
  address: "address",
  provider: "provider",
  chargeId: "charge_id",
  pixCode: "pix_code",
  pixQrImage: "pix_qr_image",
  expiresAt: "expires_at",
  paidAt: "paid_at",
  createdAt: "created_at",
};
const JSON_COLS = new Set(["items", "buyer", "address"]);

class PgStore implements OrderStore {
  private ready: Promise<void> | null = null;
  private pool: import("pg").Pool;
  constructor(pool: import("pg").Pool) {
    this.pool = pool;
  }
  private q = async (sql: string, params: unknown[] = []) => {
    if (!this.ready) this.ready = this.pool.query(DDL).then(() => undefined);
    await this.ready;
    return this.pool.query(sql, params);
  };
  async get(id: string) {
    const r = await this.q("SELECT * FROM checkout_orders WHERE id = $1", [id]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }
  async getByKey(key: string) {
    const r = await this.q("SELECT * FROM checkout_orders WHERE idempotency_key = $1", [key]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }
  async insert(o: Order) {
    const keys = Object.keys(COLS) as (keyof Order)[];
    const vals = keys.map((k) => (JSON_COLS.has(COLS[k]) && o[k] != null ? JSON.stringify(o[k]) : o[k]));
    const r = await this.q(
      `INSERT INTO checkout_orders (${keys.map((k) => COLS[k]).join(",")})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      vals,
    );
    if (r.rows[0]) return fromRow(r.rows[0]);
    return (await this.getByKey(o.idempotencyKey!))!;
  }
  async update(id: string, patch: Partial<Order>) {
    const keys = (Object.keys(patch) as (keyof Order)[]).filter((k) => k !== "id" && COLS[k]);
    if (!keys.length) return this.get(id);
    const vals = keys.map((k) => (JSON_COLS.has(COLS[k]) && patch[k] != null ? JSON.stringify(patch[k]) : patch[k]));
    const r = await this.q(
      `UPDATE checkout_orders SET ${keys.map((k, i) => `${COLS[k]} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING *`,
      [id, ...vals],
    );
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }
  async findByCharge(provider: string, chargeId: string) {
    const r = await this.q("SELECT * FROM checkout_orders WHERE provider = $1 AND charge_id = $2", [provider, chargeId]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }
}

const g = globalThis as unknown as { __checkoutStore?: OrderStore };

export async function orderStore(): Promise<OrderStore> {
  if (g.__checkoutStore) return g.__checkoutStore;
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    g.__checkoutStore = new PgStore(new Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } }));
  } else {
    g.__checkoutStore = new MemoryStore();
  }
  return g.__checkoutStore;
}

/** Só para os testes. */
export function memoryStore(): OrderStore {
  return new MemoryStore();
}
