import type { GetServerSideProps } from "next";
import { STORE, findProduct } from "@/config/store";
import { isDemo } from "@/server/env";
import StoreCheckout from "@/components/StoreCheckout";
import type { PublicCheckout } from "@/components/lib";

/** Só dados públicos vão pro navegador (os cupons ficam no servidor). */
export const getServerSideProps: GetServerSideProps<{ data: PublicCheckout }> = async ({ params }) => {
  const product = findProduct(params?.slug);
  if (!product) return { notFound: true };
  const demo = isDemo();
  return {
    props: {
      data: {
        demo,
        store: {
          name: STORE.name,
          title: STORE.checkoutTitle,
          brandColor: STORE.brandColor,
          pixDiscountPercent: STORE.pixDiscountPercent,
          couponsEnabled: STORE.coupons.some((c) => c.active),
          // a FlevoPag exige nome, e-mail, CPF e telefone
          fields: demo ? STORE.fields : { nome: true, email: true, cpf: true, celular: true },
          shipping: STORE.shipping,
        },
        product: {
          slug: product.slug,
          name: product.name,
          priceCents: product.priceCents,
          imageUrl: product.imageUrl ?? null,
          tag: product.tag ?? null,
          variant: product.variant ?? null,
          requireAddress: product.requireAddress,
          bumps: product.bumps ?? [],
        },
      },
    },
  };
};

export default function CheckoutPage({ data }: { data: PublicCheckout }) {
  return <StoreCheckout data={data} />;
}
