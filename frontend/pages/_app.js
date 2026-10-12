import Head from "next/head";
import "@/styles/globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/**
 * App shell: every page gets the same top navigation and footer so the
 * pipeline never feels like a separate tool from the marketing/info pages.
 */
export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="flex min-h-screen flex-col bg-canvas text-ink">
        <Navbar />
        <main className="flex-1 min-w-0 w-full">
          <Component {...pageProps} />
        </main>
        <Footer />
      </div>
    </>
  );
}
