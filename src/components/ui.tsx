import React, { useEffect, useId, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";
import s from "./store-checkout.module.css";
import { moneyParts, onColor } from "./lib";

export { s };

/** "R$ 449,10" */
export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={`${s.money} ${className ?? ""}`}>{brl(cents)}</span>;
}

/** Raiz com os tokens; a cor da marca vira a cor primária (botões, links, seleção). */
export function StoreRoot({
  brand,
  gray,
  children,
}: {
  brand: string;
  gray?: boolean;
  children: React.ReactNode;
}) {
  const style = {
    "--sc-brand": brand,
    "--sc-on-brand": onColor(brand),
    "--sc-primary": brand,
    "--sc-on-primary": onColor(brand),
  } as React.CSSProperties;
  return (
    <div className={`${s.root} ${gray ? s.gray : ""}`} style={style}>
      {children}
    </div>
  );
}

/** Topo da loja: voltar, nome da loja e selo de ambiente seguro. */
export function StoreHeader({
  title,
  subtitle,
  logoUrl,
  onBack,
}: {
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  onBack?: (() => void) | null;
}) {
  return (
    <>
      <header className={s.header}>
        <div className={s.headerInner}>
          {onBack ? (
            <button type="button" className={s.iconBtn} onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={22} strokeWidth={2} />
            </button>
          ) : (
            <span style

/**
 * Folha que sobe de baixo (no desktop vira um modal central). Esc fecha,
 * o foco vai pro primeiro campo e volta pra quem abriu ao fechar.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, [data-autofocus]");
      (first ?? ref.current)?.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && ref.current) {
        const els = Array.from(
          ref.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = els[0];
        const last = els[els.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className={s.sheetHead}>
          <h2 id={id} className={s.sheetTitle}>
            {title}
          </h2>
          <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Fechar">
            <X size={22} />
          </button>
        </div>
        <div className={s.sheetBody}>{children}</div>
        {footer ? <div className={s.sheetFoot}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className={s.fieldError} id={`${htmlFor}-err`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={s.hint}>{hint}</span>
      ) : null}
    </div>
  );
}

/** Mantém o campo focado visível quando o teclado do celular abre. */
export function keepVisible(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
}
