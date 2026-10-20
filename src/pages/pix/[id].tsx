/**
 * Tela do Pix: valor e código "copia e cola" DA COBRANÇA REAL criada pelo
 * servidor no provedor. O status só muda quando o servidor confirma o
 * pagamento (consulta autenticada ao provedor). Em modo demonstração o
 * código é um texto de exemplo e o botão de copiar fica desligado.
 */
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, Banknote, Check, CheckCircle2, Clock, Copy, Info, Loader2, MoreHorizontal, QrCode, RefreshCw, X } from "lucide-react";
import { BRAND } from "@/config/brand";
import { brl } from "@/components/lib";
import { StoreRoot, s } from "@/components/ui";
import { fmtLeft, useCountdown, useOrder } from "@/components/useOrder";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function PixPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;
  const { order, error, offline, reload } = useOrder(id);
  const left = useCountdown(order?.expiresAt);
  const paid = order?.status === "paid";
  const expired = !!order && !paid && (order.status !== "pending" || left === 0);
  const demo = !!order?.demo;

  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setShowQr(true);
  }, []);

  const orderHref = id ? `/pedido/${encodeURIComponent(id)}` : "/";

  const onCopy = async () => {
    if (demo || !order?.pixCode) return;
    const ok = await copyText(order.pixCode);
    setCopyFailed(!ok);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else setShowCode(true);
  };

  const head = (
    <Head>
      <title>{paid ? "Pagamento confirmado" : "Pagar com Pix"}</title>
      <meta name="theme-color" content="#ededed" />
    </Head>
  );

  if (!order) {
    return (
      <StoreRoot brand={BRAND.color} gray>
        {head}
        <div className={s.state} role="status">
          {error ? (
            <>
              <AlertCircle size={32} color="var(--sc-red)" />
              <p style={{ color: "var(--sc-text)" }}>{error}</p>
              <a className={s.link} href="/">
                Voltar à loja
              </a>
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
              <p>Carregando seu Pix...</p>
            </>
          )}
        </div>
      </StoreRoot>
    );
  }

  const amount = brl(order.totalCents);
  const deliveryNote = order.delivery
    ? "Confirmaremos a data de entrega quando o pagamento for aprovado."
    : "Você recebe a confirmação quando o pagamento for aprovado.";

  return (
    <StoreRoot brand={BRAND.color} gray>
      {head}
      {demo && (
        <div className={s.demoBanner} role="note">
          Modo demonstração · código de exemplo, não é possível pagar
        </div>
      )}
      <div className={s.pixWrap}>
        <div className={s.pixTop}>
          <button type="button" className={s.iconBtn} aria-label="Fechar e ver meu pedido" onClick={() => router.push(orderHref)}>
            <X size={26} strokeWidth={1.5} />
          </button>
        </div>

        <div className={s.hero}>
          <div className={s.heroIcon} aria-hidden style={expired ? { borderColor: "var(--sc-text-3)", color: "var(--sc-text-2)" } : undefined}>
            {paid ? <CheckCircle2 size={40} /> : expired ? <Clock size={38} /> : <Banknote size={40} strokeWidth={1.75} />}
            {!paid && !expired && (
              <span className={s.heroDot}>
                <MoreHorizontal size={16} strokeWidth={3} />
              </span>
            )}
          </div>
          {paid ? (
            <>
              <p className={s.heroKicker}>Pagamento confirmado</p>
              <h1 className={s.heroTitle}>Recebemos seu pagamento de {amount}</h1>
            </>
          ) : expired ? (
            <>
              <p className={s.heroKicker}>{order.status === "failed" ? "Pagamento não concluído" : "Tempo esgotado"}</p>
              <h1 className={s.heroTitle}>Este Pix não está mais disponível</h1>
            </>
          ) : (
            <>
              <p className={s.heroKicker}>Falta pouco!</p>
              <h1 className={s.heroTitle}>Pague {amount} via Pix para concluir sua compra</h1>
            </>
          )}
        </div>

        {paid ? (
          <div className={s.card}>
            <div className={s.cardBody}>
              <p className={s.inline}>
                <CheckCircle2 size={20} color="var(--sc-green)" />
                Pedido de {order.productName} aprovado.
              </p>
              <div className={s.alert}>
                <Info size={18} />
                <span>
                  {order.delivery
                    ? "Agora preparamos o envio. A previsão de entrega aparece no seu pedido."
                    : "Os detalhes da compra foram enviados para o e-mail informado."}
                </span>
              </div>
              <a className={`${s.btn} ${s.btnSuccess}`} href={orderHref} style={{ textDecoration: "none" }}>
                Ver meu pedido
              </a>
            </div>
          </div>
        ) : expired ? (
          <div className={s.card}>
            <div className={s.cardBody}>
              <p>
                O prazo para pagar este código acabou. Se você já pagou, aguarde: a confirmação aparece no seu pedido assim que o banco
                processar.
              </p>
              <a className={s.btn} href={`/checkout/${encodeURIComponent(order.productSlug)}`} style={{ textDecoration: "none" }}>
                Gerar novo Pix
              </a>
              <div className={s.center}>
                <a className={s.link} href={orderHref}>
                  Ver meu pedido
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Instruções de pagamento</h2>
            </div>
            <div className={s.cardBody}>
              <ol className={s.steps}>
                <li>Acesse seu Internet Banking ou app de pagamentos.</li>
                <li>Escolha pagar via Pix.</li>
                <li>{showQr ? "Escaneie o QR Code ou cole o código abaixo." : "Cole o código abaixo."}</li>
              </ol>

              {showQr && order.pixCode && !demo && (
                <div className={s.qrBox}>
                  {order.pixQrImage ? (
                    <img src={order.pixQrImage} alt="QR Code do Pix" width={200} height={200} />
                  ) : (
                    <QRCodeSVG value={order.pixCode} size={200} level="M" aria-label="QR Code do Pix" />
                  )}
                </div>
              )}

              {order.pixCode ? (
                <div className={`${s.code} ${showCode ? s.open : ""}`} onClick={() => setShowCode(true)} aria-label="Código Pix copia e cola">
                  {order.pixCode}
                </div>
              ) : (
                <div className={s.inline} role="status">
                  <Loader2 size={16} className={s.spin} /> Gerando o código Pix...
                </div>
              )}

              <p className={s.inline}>
                <Clock size={18} />
                <span>
                  {left !== null ? (
                    <>
                      Pague em até <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtLeft(left)}</b>. A confirmação é automática.
                    </>
                  ) : (
                    "Assim que o banco confirmar o pagamento, sua compra é aprovada."
                  )}
                </span>
              </p>

              <div className={s.alert}>
                <Info size={18} />
                <span>{deliveryNote}</span>
              </div>

              {copyFailed && <p className={s.fieldError}>Não deu para copiar automaticamente. Toque no código acima, selecione e copie.</p>}

              <button
                type="button"
                className={`${s.btn} ${copied ? s.btnSuccess : ""}`}
                onClick={onCopy}
                disabled={demo || !order.pixCode}
                aria-live="polite"
              >
                {copied ? (
                  <>
                    <Check size={18} /> Código copiado!
                  </>
                ) : (
                  <>
                    <Copy size={18} /> {demo ? "Copiar código (desativado na demonstração)" : "Copiar código"}
                  </>
                )}
              </button>
              {!showQr && order.pixCode && !demo && (
                <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => setShowQr(true)}>
                  <QrCode size={18} /> Mostrar QR Code
                </button>
              )}

              <p className={s.inline} style={{ justifyContent: "center", color: "var(--sc-text-2)", fontSize: 13 }} role="status">
                <Loader2 size={14} className={s.spin} />
                {offline ? "Sem conexão — tentando de novo..." : "Aguardando confirmação do pagamento"}
              </p>

              <div className={s.center}>
                <a className={s.link} href={orderHref}>
                  Ir para meu pedido
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {copied && (
        <div className={s.toast} role="status">
          <Check size={16} /> Código Pix copiado
        </div>
      )}
    </StoreRoot>
  );
}
