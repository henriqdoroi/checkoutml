import React, { useEffect, useLayoutEffect, useState } from "react";
import { Check, Loader2, MapPin, Plus } from "lucide-react";
import {
  Address,
  Billing,
  digits,
  isValidCpf,
  isValidEmail,
  lookupCep,
  maskCep,
  maskCpf,
  maskPhone,
} from "./lib";
import { Field, Sheet, keepVisible, s } from "./ui";

// sem "piscar" o conteúdo antigo ao abrir a folha (useEffect pinta antes)
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export const EMPTY_ADDRESS: Address = {
  recipient: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

/** Mesmas regras do servidor (src/compat/store-checkout.ts). */
export function addressErrors(a: Address): Partial<Record<keyof Address, string>> {
  const e: Partial<Record<keyof Address, string>> = {};
  if (digits(a.cep).length !== 8) e.cep = "CEP com 8 números.";
  if (!a.street.trim()) e.street = "Informe a rua.";
  if (!a.number.trim()) e.number = "Informe o número (ou S/N).";
  if (!a.district.trim()) e.district = "Informe o bairro.";
  if (!a.city.trim()) e.city = "Informe a cidade.";
  if (!UFS.includes(a.state.toUpperCase())) e.state = "UF";
  if (!a.recipient.trim()) e.recipient = "Informe quem vai receber.";
  return e;
}

export function addressLine(a: Address) {
  return `${a.street} ${a.number}`.trim() + (a.cep ? ` - CEP ${digits(a.cep)}` : "");
}

/* ---------------- endereço ---------------- */

export function AddressSheet({
  open,
  onClose,
  addresses,
  selected,
  onSave,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  addresses: Address[];
  selected: number;
  onSave: (a: Address, index: number | null) => void;
  onSelect: (index: number) => void;
}) {
  // lista (escolher entre os endereços desta visita) ou formulário
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<Address>(EMPTY_ADDRESS);
  const [touched, setTouched] = useState(false);
  const [cepState, setCepState] = useState<"idle" | "loading" | "notfound">("idle");

  useIsoLayoutEffect(() => {
    if (!open) return;
    setTouched(false);
    setCepState("idle");
    if (!addresses.length) {
      setEditing("new");
      setForm(EMPTY_ADDRESS);
    } else setEditing(null);
  }, [open, addresses.length]);

  const startEdit = (i: number | "new") => {
    setEditing(i);
    setTouched(false);
    setCepState("idle");
    setForm(i === "new" ? { ...EMPTY_ADDRESS, recipient: addresses[0]?.recipient ?? "" } : addresses[i] ?? EMPTY_ADDRESS);
  };

  const set = (k: keyof Address, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onCep = async (v: string) => {
    const masked = maskCep(v);
    set("cep", masked);
    if (digits(masked).length !== 8) return;
    setCepState("loading");
    const found = await lookupCep(masked);
    if (!found) {
      setCepState("notfound");
      return;
    }
    setCepState("idle");
    setForm((f) => ({
      ...f,
      street: found.street || f.street,
      district: found.district || f.district,
      city: found.city || f.city,
      state: found.state || f.state,
    }));
    // rua veio do CEP: o próximo passo é o número
    setTimeout(() => document.getElementById(found.street ? "addr-number" : "addr-street")?.focus(), 50);
  };

  const errors = addressErrors(form);
  const show = (k: keyof Address) => (touched ? errors[k] : null);

  const save = () => {
    setTouched(true);
    if (Object.keys(errors).length) {
      const first = (["cep", "street", "number", "district", "city", "state", "recipient"] as const).find((k) => errors[k]);
      if (first) document.getElementById(`addr-${first}`)?.focus();
      return;
    }
    onSave(
      { ...form, cep: maskCep(form.cep), state: form.state.toUpperCase(), street: form.street.trim(), number: form.number.trim() },
      editing === "new" || editing === null ? null : editing,
    );
  };

  const input = (k: keyof Address, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={`addr-${k}`}
      className={s.input}
      value={form[k]}
      onChange={(e) => set(k, e.target.value)}
      onFocus={keepVisible}
      aria-invalid={!!show(k)}
      aria-describedby={show(k) ? `addr-${k}-err` : undefined}
      {...props}
    />
  );

  if (editing === null) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Endereço de entrega"
        footer={
          <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => startEdit("new")}>
            <Plus size={18} /> Adicionar outro endereço
          </button>
        }
      >
        <div className={s.optionList} role="radiogroup" aria-label="Endereços">
          {addresses.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                role="radio"
                aria-checked={i === selected}
                className={s.option}
                onClick={() => {
                  onSelect(i);
                  onClose();
                }}
              >
                <span className={`${s.radio} ${i === selected ? s.on : ""}`} />
                <span className={s.optionBody}>
                  <span className={s.optionTitle} style={{ fontWeight: 600 }}>
                    {addressLine(a)}
                  </span>
                  <span className={s.optionSub} style={{ display: "block" }}>
                    {a.district} · {a.city}/{a.state} · {a.recipient}
                  </span>
                </span>
              </button>
              <button type="button" className={s.link} onClick={() => startEdit(i)}>
                Editar
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing === "new" ? "Novo endereço" : "Editar endereço"}
      footer={
        <button type="button" className={s.btn} onClick={save}>
          <Check size={18} /> Usar este endereço
        </button>
      }
    >
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <Field
          label="CEP"
          htmlFor="addr-cep"
          error={show("cep")}
          hint={cepState === "notfound" ? "CEP não encontrado — preencha o endereço abaixo." : undefined}
        >
          <div style={{ position: "relative" }}>
            {input("cep", {
              inputMode: "numeric",
              autoComplete: "postal-code",
              placeholder: "00000-000",
              onChange: (e) => onCep(e.target.value),
            })}
            {cepState === "loading" && (
              <Loader2 size={18} className={s.spin} style={{ position: "absolute", right: 12, top: 15, color: "var(--sc-text-2)" }} />
            )}
          </div>
        </Field>
        <Field label="Rua / Avenida" htmlFor="addr-street" error={show("street")}>
          {input("street", { autoComplete: "address-line1", placeholder: "Ex.: Rua das Flores" })}
        </Field>
        <div className={s.grid2}>
          <Field label="Número" htmlFor="addr-number" error={show("number")}>
            {input("number", { inputMode: "text", autoComplete: "off", placeholder: "123" })}
          </Field>
          <Field label="Complemento (opcional)" htmlFor="addr-complement">
            {input("complement", { autoComplete: "address-line2", placeholder: "Apto, bloco" })}
          </Field>
        </div>
        <Field label="Bairro" htmlFor="addr-district" error={show("district")}>
          {input("district", { autoComplete: "address-level3" })}
        </Field>
        <div className={s.gridCity}>
          <Field label="Cidade" htmlFor="addr-city" error={show("city")}>
            {input("city", { autoComplete: "address-level2" })}
          </Field>
          <Field label="UF" htmlFor="addr-state" error={show("state")}>
            <select
              id="addr-state"
              className={s.input}
              value={form.state.toUpperCase()}
              onChange={(e) => set("state", e.target.value)}
              aria-invalid={!!show("state")}
              autoComplete="address-level1"
            >
              <option value="">--</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Nome de quem vai receber" htmlFor="addr-recipient" error={show("recipient")}>
          {input("recipient", { autoComplete: "name", placeholder: "Nome completo" })}
        </Field>
        <button type="submit" className={s.srOnly} tabIndex={-1}>
          Salvar
        </button>
      </form>
      {addresses.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className={s.link} onClick={() => setEditing(null)}>
            <MapPin size={16} /> Escolher outro endereço salvo
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- faturamento ---------------- */

export type BillingFields = { nome: boolean; email: boolean; cpf: boolean; celular: boolean };

export function billingErrors(b: Billing, f: BillingFields): Partial<Record<keyof Billing, string>> {
  const e: Partial<Record<keyof Billing, string>> = {};
  if (f.nome && b.name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome.";
  if (f.email && !isValidEmail(b.email)) e.email = "E-mail inválido.";
  if (f.cpf && !isValidCpf(b.cpf)) e.cpf = "CPF inválido.";
  if (f.celular && digits(b.phone).length < 10) e.phone = "Celular com DDD.";
  return e;
}

export function BillingSheet({
  open,
  onClose,
  fields,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  fields: BillingFields;
  value: Billing;
  onSave: (b: Billing) => void;
}) {
  const [form, setForm] = useState<Billing>(value);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(value);
      setTouched(false);
    }
  }, [open, value]);

  const errors = billingErrors(form, fields);
  const show = (k: keyof Billing) => (touched ? errors[k] : null);
  const save = () => {
    setTouched(true);
    const first = (["name", "email", "cpf", "phone"] as const).find((k) => errors[k]);
    if (first) {
      document.getElementById(`bill-${first}`)?.focus();
      return;
    }
    onSave({ ...form, name: form.name.trim(), email: form.email.trim() });
  };
  const common = (k: keyof Billing) => ({
    id: `bill-${k}`,
    className: s.input,
    value: form[k],
    onFocus: keepVisible,
    "aria-invalid": !!show(k),
    "aria-describedby": show(k) ? `bill-${k}-err` : undefined,
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Dados de faturamento"
      footer={
        <button type="button" className={s.btn} onClick={save}>
          <Check size={18} /> Salvar dados
        </button>
      }
    >
      <form
        className={s.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {fields.nome && (
          <Field label="Nome completo" htmlFor="bill-name" error={show("name")}>
            <input {...common("name")} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        )}
        {fields.cpf && (
          <Field label="CPF" htmlFor="bill-cpf" error={show("cpf")}>
            <input
              {...common("cpf")}
              inputMode="numeric"
              placeholder="000.000.000-00"
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
            />
          </Field>
        )}
        {fields.email && (
          <Field label="E-mail" htmlFor="bill-email" error={show("email")} hint="Enviaremos a confirmação do pedido.">
            <input
              {...common("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nome@email.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        )}
        {fields.celular && (
          <Field label="Celular" htmlFor="bill-phone" error={show("phone")}>
            <input
              {...common("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 91234-5678"
              onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
            />
          </Field>
        )}
        <button type="submit" className={s.srOnly} tabIndex={-1}>
          Salvar
        </button>
      </form>
    </Sheet>
  );
}

/* ---------------- cupom ---------------- */

export function CouponSheet({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** Valida no servidor; devolve a mensagem de erro (ou null se aplicou). */
  onApply: (code: string) => Promise<string | null>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
    }
  }, [open]);

  const apply = async () => {
    const c = code.trim();
    if (!c) {
      setError("Digite o código do cupom.");
      return;
    }
    setBusy(true);
    const err = await onApply(c);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cupom de desconto"
      footer={
        <button type="button" className={s.btn} onClick={apply} disabled={busy}>
          {busy ? <Loader2 size={18} className={s.spin} /> : null}
          {busy ? "Validando..." : "Aplicar cupom"}
        </button>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Field label="Código do cupom" htmlFor="coupon-code" error={error}>
          <input
            id="coupon-code"
            className={s.input}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
              setError(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            placeholder="EX.: PRIMEIRACOMPRA"
            aria-invalid={!!error}
          />
        </Field>
      </form>
    </Sheet>
  );
}
