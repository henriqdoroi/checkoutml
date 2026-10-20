import { useCallback, useEffect, useRef, useState } from "react";
import { PublicOrder, fetchOrder } from "./lib";

const DONE = (s: string) => s !== "pending";

/**
 * Pedido + acompanhamento: enquanto pendente consulta a cada 5s (o servidor
 * pergunta ao provedor — quem confirma é ele, nunca o navegador).
 */
export function useOrder(id: string | null) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!id) return null;
    try {
      const o = await fetchOrder(id);
      if (!alive.current) return null;
      setOrder(o);
      setError(null);
      setOffline(false);
      return o;
    } catch (e: any) {
      if (!alive.current) return null;
      if (e?.code === "offline") setOffline(true);
      else setError(e?.message || "Pedido não encontrado.");
      return null;
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    if (!id) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const o = await load();
      if (stopped) return;
      if (!(o && DONE(o.status))) timer = setTimeout(tick, document.hidden ? 15000 : 5000);
    };
    tick();
    return () => {
      stopped = true;
      alive.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, load]);

  return { order, error, offline, reload: load };
}

export function useCountdown(expiresAt: string | null | undefined) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) {
      setLeft(null);
      return;
    }
    const end = new Date(expiresAt).getTime();
    if (!Number.isFinite(end)) return;
    const upd = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    upd();
    const t = setInterval(upd, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return left;
}

export function fmtLeft(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}
