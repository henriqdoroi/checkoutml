/** Validação dos dados do comprador (mesmas regras do formulário). */

export type ShippingAddress = {
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
};

export type Buyer = { name: string; email: string | null; cpf: string | null; phone: string | null };

const UF = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
const digits = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : "");

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

export function parseAddress(v: unknown): { ok: true; address: ShippingAddress } | { ok: false; message: string } {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const a: ShippingAddress = {
    recipient: text(o.recipient, 120),
    cep: digits(o.cep),
    street: text(o.street, 160),
    number: text(o.number, 20),
    complement: text(o.complement, 80) || null,
    district: text(o.district, 80),
    city: text(o.city, 80),
    state: text(o.state, 2).toUpperCase(),
  };
  if (a.cep.length !== 8) return { ok: false, message: "Informe um CEP válido (8 números)." };
  if (!a.street) return { ok: false, message: "Informe a rua do endereço de entrega." };
  if (!a.number) return { ok: false, message: 'Informe o número do endereço (ou "S/N").' };
  if (!a.district) return { ok: false, message: "Informe o bairro do endereço de entrega." };
  if (!a.city) return { ok: false, message: "Informe a cidade do endereço de entrega." };
  if (!UF.has(a.state)) return { ok: false, message: "Informe o estado (UF) do endereço de entrega." };
  if (!a.recipient) return { ok: false, message: "Informe o nome de quem vai receber." };
  return { ok: true, address: a };
}

export function parseBuyer(
  v: Record<string, unknown>,
  fields: { nome: boolean; email: boolean; cpf: boolean; celular: boolean },
  fallbackName = "",
): { ok: true; buyer: Buyer } | { ok: false; message: string } {
  const name = text(v.name, 120) || fallbackName;
  const email = text(v.email, 180).toLowerCase();
  const cpf = digits(v.document);
  const phone = digits(v.phone);
  if (fields.nome && name.split(/\s+/).length < 2) return { ok: false, message: "Informe nome e sobrenome." };
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: "E-mail inválido." };
  if (fields.cpf && !isValidCpf(cpf)) return { ok: false, message: "CPF inválido." };
  if (fields.celular && (phone.length < 10 || phone.length > 13)) return { ok: false, message: "Celular inválido." };
  return {
    ok: true,
    buyer: { name: name || "Cliente", email: email || null, cpf: cpf || null, phone: phone || null },
  };
}
