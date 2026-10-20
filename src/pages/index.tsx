import type { GetServerSideProps } from "next";
import Head from "next/head";
import { Package } from "lucide-react";
import { STORE } from "@/config/store";
import { brl } from "@/components/lib";
import { StoreHeader, StoreRoot, s } from "@/components/ui";

type Item = { slug: string; name: string; priceCents: number; imageUrl: string | null };

export const getServerSideProps: GetServerSideProps<{ name: string; brand: string; items: Item[] }> = async () => ({
  props: {
    name: STORE.name,
    brand: STORE.brandColor,
    items: STORE.products
      .filter((p) => p.active)
      .map((p) => ({ slug: p.slug, name: p.name, priceCents: p.priceCents, imageUrl: p.imageUrl ?? null })),
  },
});

export default function Home({ name, brand, items }: { name: string; brand: string; items: Item[] }) {
  return (
    <StoreRoot brand={brand}>
      <Head>
        <title>{name}</title>
      </Head>
      <StoreHeader title={name} onBack={null} />
      <main className={s.main} style={{ paddingBottom: 32 }}>
        {items.length === 0 && <div className={s.state}>Nenhum produto disponível no momento.</div>}
        {items.map((p) => (
          <a key={p.slug} href={`/checkout/${p.slug}`} className={s.product} style={{ textDecoration: "none", color: "inherit" }}>
            <div className={s.thumb}>{p.imageUrl ? <img src={p.imageUrl} alt="" /> : <Package size={28} />}</div>
            <div className={s.productInfo}>
              <p className={s.productName}>{p.name}</p>
              <p className={s.productMeta} style={{ color: "var(--sc-text)", fontWeight: 600, fontSize: 16 }}>
                {brl(p.priceCents)}
              </p>
            </div>
          </a>
        ))}
      </main>
    </StoreRoot>
  );
}
