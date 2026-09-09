import "@/styles/globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/**
 * App shell: every page gets the same top navigation and footer so the
 * pipeline never feels like a separate tool from the marketing/info pages.
 */
export default function App({ Component, pageProps }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Navbar />
      <main className="flex-1">
        <Component {...pageProps} />
      </main>
      <Footer />
    </div>
  );
}
