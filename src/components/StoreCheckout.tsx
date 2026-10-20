/**
 * Tela de checkout (mobile-first): produto, entrega, envio, adicionais,
 * pagamento, faturamento, resumo e barra fixa com o total.
 *
 * O resumo mostra a cotação do servidor (/api/quote). O pedido é criado em
 * /api/orders com uma chave de idempotência — clique duplo não duplica.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { toast } from "sonner";
import { AlertCircle, ChevronUp, Loader2, Lock, MapPin, Package, Pencil, Plus, Ticket, Truck } from "lucide-react";
import {
  Address,
  ApiError,
  Billing,
  PublicCheckout,
  Quote,
  brl,
  cpfHint,
  createOrder,
  deliveryWindow,
  digits,
  fetchQuote,
  newCheckoutKey,
  readTracking,
} from "./lib";
import { AddressSheet, BillingSheet, CouponSheet, addressErrors, addressLine, billingErrors } from "./forms";
import { Money, StoreHeader, StoreRoot, s } from "./ui";

const EMPTY_BILLING: Billing = { name: "", email: "", cpf: "", phone: "" };

export default function StoreCheckout({ data }: { data: PublicCheckout }) {
  const { store, product, demo } = data;
  const fields = store.fields;
  const bumps = product.bumps;
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrIndex, setAddrIndex] = useState(0);
  const address = addresses[addrIndex] ?? null;
  const [billing, setBilling] = useState<Billing>(EMPTY_BILLING);
  const [selectedBumps, setSelectedBumps] = useState<string[]>([]);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "address" | "billing" | "coupon">(null);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => setCanGoBack(window.history.length > 1), []);

  const needsAddress = product.requireAddress;
  const hasBilling = fields.nome || fields.email || fields.cpf || fields.celular;
  const pixPercent = store.pixDiscountPercent;

  /* ---------- cotação ---------- */
  const localQuote = useMemo<Quote>(() => {
    const subtotal = product.priceCents + bumps.filter((b) => selectedBumps.includes(b.id)).reduce((t, b) => t + b.priceCents, 0);
    const goods = pixPercent > 0 ? Math.round((subtotal * (100 - pixPercent)) / 100) : subtotal;
    const ship = needsAddress && store.shipping.mode === "fixed" ? store.shipping.priceCents : 0;
    return {
      subtotalCents: subtotal,
      couponDiscountCents: 0,
      pixDiscountCents: subtotal - goods,
      pixDiscountPercent: pixPercent,
      shippingCents: ship,
      totalCents: goods + ship,
      coupon: null,
    };
  }, [product.priceCents, bumps, selectedBumps, pixPercent, needsAddress, store.shipping]);

  const [serverQuote, setServerQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteSeq = useRef(0);
  const bumpKey = selectedBumps.slice().sort().join(",");

  const runQuote = useCallback(
    async (couponCode: string | null) => {
      const seq = ++quoteSeq.current;
      setQuoting(true);
      try {
        const q = await fetchQuote({ slug: product.slug, bumpIds: bumpKey ? bumpKey.split(",") : [], couponCode });
        if (seq === quoteSeq.current) setServerQuote(q);
        return { ok: true as const, quote: q };
      } catch (e: any) {
        if (seq === quoteSeq.current) setServerQuote(null);
        return { ok: false as const, error: e as ApiError };
      } finally {
        if (seq === quoteSeq.current) setQuoting(false);
      }
    },
    [product.slug, bumpKey],
  );

  useEffect(() => {
    let alive = true;
    runQuote(coupon).then((r) => {
      if (!alive || r.ok) return;
      if (r.error.code === "coupon_invalid") {
        setCoupon(null);
        toast.error("O cupom deixou de valer e foi removido.");
      }
    });
    return () => {
      alive = false;
    };
  }, [runQuote, coupon]);

  const quote = serverQuote ?? localQuote;

  // mesma escolha = mesma chave; mudou algo, chave nova
  const checkoutKey = useMemo(
    () => newCheckoutKey(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bumpKey, coupon, addrIndex, address, billing],
  );

  /* ---------- barra fixa ---------- */
  const summaryRef = useRef<HTMLElement>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSummaryVisible(!!e?.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ---------- validação ---------- */
  const addrMissing = needsAddress && (!address || Object.keys(addressErrors(address)).length > 0);
  const billErrors = hasBilling ? billingErrors(billing, fields) : {};
  const billMissing = Object.keys(billErrors).length > 0;

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const submit = async () => {
    if (submittingRef.current) return;
    setAttempted(true);
    setSubmitError(null);
    if (addrMissing) {
      scrollTo("sc-entrega");
      setSheet("address");
      return;
    }
    if (billMissing) {
      scrollTo("sc-faturamento");
      setSheet("billing");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const order = await createOrder({
        slug: product.slug,
        bumpIds: selectedBumps,
        couponCode: serverQuote?.coupon?.code ?? coupon ?? undefined,
        name: (fields.nome ? billing.name : address?.recipient) || undefined,
        email: fields.email ? billing.email : undefined,
        document: fields.cpf ? digits(billing.cpf) : undefined,
        phone: fields.celular ? digits(billing.phone) : undefined,
        shippingAddress: needsAddress && address ? { ...address, cep: digits(address.cep) } : undefined,
        checkoutKey,
        tracking: readTracking(),
      });
      router.push(`/pix/${encodeURIComponent(order.id)}`);
    } catch (e: any) {
      submittingRef.current = false;
      setSubmitting(false);
      const msg = e?.message || "Não foi possível gerar o Pix. Tente de novo.";
      setSubmitError(msg);
      toast.error(msg);
      if (e?.code === "coupon_invalid") setCoupon(null);
      if (e?.code === "address_invalid") setSheet("address");
      if (e?.code === "buyer_invalid") setSheet("billing");
    }
  };

  const applyCoupon = async (code: string): Promise<string | null> => {
    const r = await runQuote(code);
    if (!r.ok) {
      runQuote(coupon);
      return r.error.message || "Cupom inválido.";
    }
    setCoupon(r.quote.coupon?.code ?? code);
    setSheet(null);
    toast.success("Cupom aplicado.");
    return null;
  };

  const shipLabel = needsAddress ? deliveryWindow(store.shipping.daysMin, store.shipping.daysMax) : "";
  const couponRow = store.couponsEnabled && !quote.coupon && (
    <button type="button" className={s.link} onClick={() => setSheet("coupon")}>
      <Ticket size={18} /> Inserir código do cupom
    </button>
  );

  return (
    <StoreRoot brand={store.brandColor}>
      <Head>
        <title>{`${store.title} · ${product.name} · ${store.name}`}</title>
        <meta name="theme-color" content={store.brandColor} />
      </Head>

      {demo && (
        <div className={s.demoBanner} role="note">
          Modo demonstração · nenhuma cobrança real é gerada
        </div>
      )}
      <StoreHeader title={store.title} onBack={canGoBack ? () => window.history.back() : null} />

      <main className={s.main}>
        <div className={s.product}>
          <div className={s.thumb}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Package size={28} />}</div>
          <div className={s.productInfo}>
            {product.tag ? <span className={s.tag}>{product.tag}</span> : null}
            <p className={s.productName}>{product.name}</p>
            {product.variant ? <p className={s.productMeta}>{product.variant}</p> : null}
          </div>
        </div>

        {needsAddress && (
          <section className={s.section} id="sc-entrega" aria-labelledby="sc-entrega-t">
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle} id="sc-entrega-t">
                Forma de entrega
              </h2>
            </div>
            <button type="button" className={`${s.addressCard} ${address ? "" : s.empty}`} onClick={() => setSheet("address")}>
              <MapPin size={22} className={s.addressIcon} fill="currentColor" stroke="var(--sc-bg)" />
              <span style={{ minWidth: 0 }}>
                {address ? (
                  <>
                    <span className={s.addressLine} style={{ display: "block" }}>
                      {addressLine(address)}
                    </span>
                    <span className={s.addressSub} style={{ display: "block" }}>
                      {address.district} · {address.city}/{address.state}
                      {address.complement ? ` · ${address.complement}` : ""}
                    </span>
                    <span className={s.link} style={{ marginTop: 6 }}>
                      Alterar endereço
                    </span>
                  </>
                ) : (
                  <>
                    <span className={s.addressLine} style={{ display: "block" }}>
                      Adicionar endereço de entrega
                    </span>
                    <span className={s.link} style={{ marginTop: 6 }}>
                      <Plus size={16} /> Informar CEP
                    </span>
                  </>
                )}
              </span>
            </button>
            {attempted && addrMissing && (
              <p className={s.fieldError} style={{ marginTop: 8 }}>
                Informe o endereço de entrega para continuar.
              </p>
            )}
          </section>
        )}

        {needsAddress && (
          <section className={s.section} aria-labelledby="sc-envio-t">
            <div className={s.sectionHead} style={{ marginBottom: 4 }}>
              <h2 className={s.sectionTitle} id="sc-envio-t" style={{ fontSize: 16 }}>
                Envio
              </h2>
              <Truck size={20} color="var(--sc-text-2)" aria-hidden />
            </div>
            <div className={s.optionList} role="radiogroup" aria-labelledby="sc-envio-t">
              <div className={s.option} role="radio" aria-checked="true" tabIndex={0} style={{ cursor: "default" }}>
                <span className={`${s.radio} ${s.on}`} />
                <span className={s.optionBody}>
                  <span className={s.optionTitle}>{shipLabel}</span>
                  <span className={s.optionSub} style={{ display: "block" }}>
                    {store.shipping.label} · Única opção disponível
                  </span>
                </span>
                <span className={`${s.optionRight} ${store.shipping.mode === "free" ? s.free : ""}`}>
                  {store.shipping.mode === "free" ? "Grátis" : brl(store.shipping.priceCents)}
                </span>
              </div>
            </div>
          </section>
        )}

        {bumps.length > 0 && (
          <section className={s.section} aria-labelledby="sc-bumps-t">
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle} id="sc-bumps-t">
                Aproveite também
              </h2>
            </div>
            <div className={s.optionList}>
              {bumps.map((b) => {
                const on = selectedBumps.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={s.option}
                    onClick={() => setSelectedBumps((p) => (on ? p.filter((x) => x !== b.id) : [...p, b.id]))}
                  >
                    <span className={`${s.check} ${on ? s.on : ""}`}>
                      {on ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : null}
                    </span>
                    <span className={s.optionBody}>
                      <span className={s.optionTitle} style={{ fontWeight: 500 }}>
                        {b.title}
                      </span>
                      <span className={s.optionSub} style={{ display: "block" }}>
                        {b.description}
                      </span>
                    </span>
                    <span className={s.optionRight}>+ {brl(b.priceCents)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className={s.section} id="sc-pagamento" aria-labelledby="sc-pag-t">
          <div className={s.sectionHead} style={{ marginBottom: 4 }}>
            <h2 className={s.sectionTitle} id="sc-pag-t">
              Meios de pagamento
            </h2>
          </div>
          <div className={s.optionList} role="radiogroup" aria-labelledby="sc-pag-t">
            <div className={s.option} role="radio" aria-checked="true" tabIndex={0} style={{ padding: "14px 0", cursor: "default" }}>
              <span className={`${s.radio} ${s.on}`} />
              <span className={s.methodIcon} aria-hidden>
                <img src="/icons/pix.png" alt="" />
              </span>
              <span className={s.optionBody}>
                {quote.pixDiscountCents > 0 && <span className={s.badgeDark}>Pague menos</span>}
                <span className={s.optionTitle} style={{ display: "block" }}>
                  Pix
                </span>
                {quote.pixDiscountCents > 0 ? (
                  <span className={s.pillGreen}>
                    Economize <b>{brl(quote.pixDiscountCents)}</b>
                  </span>
                ) : (
                  <span className={s.optionSub} style={{ display: "block" }}>
                    Aprovação após a confirmação do banco
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>

        {hasBilling && (
          <section className={s.section} id="sc-faturamento" aria-labelledby="sc-fat-t">
            <div className={s.sectionHead} style={{ marginBottom: 10 }}>
              <h2 className={s.sectionTitle} id="sc-fat-t">
                Faturamento
              </h2>
            </div>
            {billMissing && !billing.name && !billing.email ? (
              <p style={{ margin: "0 0 8px", color: "var(--sc-text-2)" }}>Informe seus dados para emitir o pedido.</p>
            ) : (
              <div style={{ marginBottom: 8, overflowWrap: "anywhere" }}>
                {[fields.nome && billing.name, fields.cpf && billing.cpf && `CPF ${cpfHint(billing.cpf)}`].filter(Boolean).join(" - ")}
                {fields.email && billing.email ? <div className={s.muted}>{billing.email}</div> : null}
              </div>
            )}
            <button
              type="button"
              className={s.link}
              onClick={() => {
                if (!billing.name && address?.recipient) setBilling((b) => ({ ...b, name: address.recipient }));
                setSheet("billing");
              }}
            >
              {billMissing && !billing.name && !billing.email ? (
                <>
                  <Plus size={16} /> Adicionar dados
                </>
              ) : (
                <>
                  <Pencil size={15} /> Alterar
                </>
              )}
            </button>
            {attempted && billMissing && (
              <p className={s.fieldError} style={{ marginTop: 6 }}>
                {Object.values(billErrors)[0]}
              </p>
            )}
          </section>
        )}

        <section className={s.section} ref={summaryRef} aria-labelledby="sc-resumo-t">
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle} id="sc-resumo-t">
              Resumo da compra
            </h2>
            {quoting && <Loader2 size={16} className={s.spin} color="var(--sc-text-2)" aria-label="Atualizando" />}
          </div>
          <div className={s.rows} aria-live="polite">
            <div className={s.row}>
              <span>Produto</span>
              <span>{brl(product.priceCents)}</span>
            </div>
            {bumps
              .filter((b) => selectedBumps.includes(b.id))
              .map((b) => (
                <div className={s.row} key={b.id}>
                  <span>{b.title}</span>
                  <span>{brl(b.priceCents)}</span>
                </div>
              ))}
            {needsAddress && (
              <div className={s.row}>
                <span>Frete</span>
                <span className={quote.shippingCents ? "" : s.free}>{quote.shippingCents ? brl(quote.shippingCents) : "Grátis"}</span>
              </div>
            )}
            {quote.coupon && (
              <div className={`${s.row} ${s.rowGreen}`}>
                <span>Cupom {quote.coupon.code}</span>
                <span>− {brl(quote.couponDiscountCents)}</span>
              </div>
            )}
            {quote.pixDiscountCents > 0 && (
              <div className={`${s.row} ${s.rowGreen}`}>
                <span>Desconto Pix ({quote.pixDiscountPercent}%)</span>
                <span>− {brl(quote.pixDiscountCents)}</span>
              </div>
            )}
            {quote.coupon ? (
              <div className={s.couponApplied}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Ticket size={16} /> Cupom <b>{quote.coupon.code}</b> aplicado
                </span>
                <button type="button" className={`${s.link} ${s.linkDanger}`} onClick={() => setCoupon(null)}>
                  Remover
                </button>
              </div>
            ) : (
              couponRow
            )}
            <div className={s.divider} />
            <div className={s.totalRow}>
              <span>Total</span>
              <Money cents={quote.totalCents} />
            </div>
          </div>
          <p className={s.muted} style={{ marginTop: 16, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Lock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Pagamento processado com segurança. Seus dados são usados só para emitir e entregar o pedido.</span>
          </p>
          {submitError && (
            <div className={`${s.alert} ${s.alertError}`} role="alert" style={{ marginTop: 14 }}>
              <AlertCircle size={18} />
              <span>{submitError}</span>
            </div>
          )}
        </section>
      </main>

      <div className={s.bar}>
        {!summaryVisible && couponRow && <div className={s.barCoupon}>{couponRow}</div>}
        <div className={s.barInner}>
          {!summaryVisible && (
            <button
              type="button"
              className={s.barTotal}
              onClick={() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              aria-label={`Total ${brl(quote.totalCents)}. Ver resumo da compra`}
            >
              <Money cents={quote.totalCents} />
              <ChevronUp size={20} />
            </button>
          )}
          <button type="button" className={s.btn} onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={18} className={s.spin} /> Gerando Pix...
              </>
            ) : (
              "Pagar e finalizar"
            )}
          </button>
        </div>
      </div>

      <AddressSheet
        open={sheet === "address"}
        onClose={() => setSheet(null)}
        addresses={addresses}
        selected={addrIndex}
        onSelect={setAddrIndex}
        onSave={(a, i) => {
          if (i === null) {
            setAddresses((list) => [...list, a]);
            setAddrIndex(addresses.length);
          } else {
            setAddresses((list) => list.map((x, j) => (j === i ? a : x)));
            setAddrIndex(i);
          }
          if (fields.nome && !billing.name) setBilling((b) => ({ ...b, name: a.recipient }));
          setSheet(null);
        }}
      />
      <BillingSheet
        open={sheet === "billing"}
        onClose={() => setSheet(null)}
        fields={fields}
        value={billing}
        onSave={(b) => {
          setBilling(b);
          setSheet(null);
        }}
      />
      <CouponSheet open={sheet === "coupon"} onClose={() => setSheet(null)} onApply={applyCoupon} />
    </StoreRoot>
  );
}
