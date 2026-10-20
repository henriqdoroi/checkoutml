/** Página do pedido: status real, itens, total e previsão de entrega (sem dados pessoais). */
import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { AlertCircle, CheckCircle2, Clock, Loader2, MapPin, Package, RefreshCw, XCircle } from "lucide-react";
import { BRAND } from "@/config/brand";
import { brl, deliveryWindow } from "@/components/lib";
import { Money, StoreHeader, StoreRoot, s } from "@/components/ui";
import { useOrder } from "@/components/useOrder";

export default function OrderPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;
  const { order, error, offline, reload } = useOrder(id);

  const head = (
    <Head>
      <title>Meu pedido</title>
    </Head>
  );

  if (!order) {
    return (
      <StoreRoot brand={BRAND.color}>
        {head}
        <StoreHeader title="Meu pedido" onBack={null} />
        <div className={s.state} role="status">
          {error ? (
            <>
              <AlertCircle size={32} color="var(--sc-red)" />
              <p style={{ color: "var(--sc-text)" }}>{error}</p>
            </>
          ) : offline ? (
            <>
              <AlertCircle size={32} />
              <p>Sem conexão. Verifique sua internet.</p>
              <button type="button" className={s.link} onClick={() => reload()}>
                <RefreshCw size={16} /> Tentar de novo
              </button>
            </>
          ) : (
            <>
              <Loader2 size={28} className={s.spin} />
              <p>Carregando pedido...</p>
            </>
          )}
        </div>
      </StoreRoot>
    );
  }

  const paid = order.status === "paid";
  const pending = order.status === "pending";
  const pixHref = `/pix/${encodeURIComponent(order.id)}`;
  const created = new Date(order.createdAt);
  const goods = order.items.filter((i) => i.kind !== "shipping");
  const ship = order.items.find((i) => i.kind === "shipping");
  const status = paid
    ? { cls: s.stPaid, icon: <CheckCircle2 size={15} />, text: "Pagamento aprovado" }
    : pending
      ? { cls: s.stPending, icon: <Clock size={15} />, text: "Aguardando pagamento" }
      : { cls: s.stFail, icon: <XCircle size={15} />, text: order.status === "refunded" ? "Reembolsado" : "Não pago" };

  return (
    <StoreRoot brand={BRAND.color}>
      {head}
      {order.demo && (
        <div className={s.demoBanner} role="note">
          Modo demonstração · pedido de exemplo
        </div>
      )}
      <StoreHeader title="Meu pedido" onBack={pending ? () => router.push(pixHref) : null} />
      <main className={s.main} style={{ paddingBottom: 32 }}>
        <section className={s.section}>
          <div className={s.sectionHead} style={{ marginBottom: 8, flexWrap: "wrap" }}>
            <h2 className={s.sectionTitle}>Pedido #{order.id.slice(0, 8).toUpperCase()}</h2>
            <span className={`${s.statusPill} ${status.cls}`} role="status">
              {status.icon}
              {status.text}
            </span>
          </div>
          <p className={s.muted}>
            Feito em {created.toLocaleDateString("pt-BR")} às {created.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {pending && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <a className={s.btn} href={pixHref} style={{ textDecoration: "none" }}>
                Pagar {brl(order.totalCents)} com Pix
              </a>
              <p className={s.muted} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Loader2 size={13} className={s.spin} /> Esta página atualiza sozinha quando o pagamento for confirmado.
              </p>
            </div>
          )}
          {!paid && !pending && (
            <div style={{ marginTop: 16 }}>
              <a className={s.btn} href={`/checkout/${encodeURIComponent(order.productSlug)}`} style={{ textDecoration: "none" }}>
                Comprar novamente
              </a>
            </div>
          )}
        </section>

        {order.delivery && (
          <section className={s.section}>
            <div className={s.sectionHead} style={{ marginBottom: 8 }}>
              <h2 className={s.sectionTitle} style={{ fontSize: 16 }}>
                Entrega
              </h2>
            </div>
            <p className={s.inline}>
              <MapPin size={18} color="var(--sc-primary)" />
              <span>
                {order.delivery.city}/{order.delivery.state}
              </span>
            </p>
            <p className={s.muted} style={{ marginTop: 6 }}>
              {paid
                ? `${deliveryWindow(order.delivery.daysMin, order.delivery.daysMax, order.paidAt ? new Date(order.paidAt) : new Date())} (previsão)`
                : "A previsão de entrega é confirmada depois que o pagamento for aprovado."}
            </p>
          </section>
        )}

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} style={{ fontSize: 16 }}>
              Itens
            </h2>
          </div>
          <div className={s.rows}>
            {goods.map((i, k) => (
              <div className={s.row} key={k}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "flex-start" }}>
                  <Package size={16} style={{ flexShrink: 0, marginTop: 2 }} color="var(--sc-text-2)" />
                  {i.quantity > 1 ? `${i.quantity}× ` : ""}
                  {i.name}
                </span>
                <span>{brl(i.priceCents * i.quantity)}</span>
              </div>
            ))}
            {order.delivery && (
              <div className={s.row}>
                <span>Frete</span>
                {ship ? <span>{brl(ship.priceCents)}</span> : <span className={s.free}>Grátis</span>}
              </div>
            )}
            <div className={s.divider} />
            <div className={s.totalRow}>
              <span>Total</span>
              <Money cents={order.totalCents} />
            </div>
            <p className={s.muted}>Valores já com descontos aplicados.</p>
          </div>
        </section>
      </main>
    </StoreRoot>
  );
}
