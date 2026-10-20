import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={inter.variable}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
      </Head>
      <Component {...pageProps} />
      <Toaster position="top-center" richColors />
    </div>
  );
}
