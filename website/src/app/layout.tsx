import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

// The two faces the current site uses: Inter Tight for headings, Inter for
// everything else. Loaded through next/font so they are served from our own
// domain and cannot shift the layout as they arrive.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const tight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://eurokidsjmdenclave.org"),
  title: {
    default: "EuroKids JMD Enclave | Best Preschool in Undri",
    template: "%s | EuroKids JMD Enclave",
  },
  description:
    "EuroKids JMD Enclave, Undri — preschool and day care in Pune. Est. 2017, trusted by 3000+ parents, 6,000 sq ft of play area. Admissions open for 26-27.",
  openGraph: {
    type: "website",
    siteName: "EuroKids JMD Enclave",
    title: "EuroKids JMD Enclave | Best Preschool in Undri",
    description: "Preschool and day care in Undri, Pune. Admissions open for 26-27.",
  },
  robots: { index: true, follow: true },
  // Without a manifest and an apple-touch-icon, Safari's "Add to Home Screen"
  // has nothing to add and does nothing at all when you tap it — which is
  // exactly what was happening on the reception iPad.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EuroKids", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#FCF8F6",
  width: "device-width",
  initialScale: 1,
  // Not locked: a parent who needs to zoom in to read the fee line should be
  // able to.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${tight.variable}`}>
        <Header />
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="wrap">
            <div className="foot-top">
              <div>
                {/* On white, because the logo's own lettering is EuroKids blue
                    and it disappears into the red otherwise. */}
                <span className="foot-logo">
                  <img
                    src="https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/eurokids-logo.png"
                    alt="EuroKids Pre-School"
                  />
                </span>
                <p style={{ margin: "16px 0 0", maxWidth: "32ch" }}>
                  <strong>EuroKids JMD Enclave</strong>
                  <br />
                  JMD Enclave, Undri, Pune 411060
                  <br />
                  Est. 2017 · Trusted by 3,000+ parents
                </p>
              </div>
              <div>
                <h4>Come and see us</h4>
                <a href="tel:+912069622686">020 6962 2686</a>
                <a href="mailto:admin@eurokidsjmdenclave.org">admin@eurokidsjmdenclave.org</a>
                <a href="/contact">Where we are</a>
                <a href="#enquire">Book a visit</a>
              </div>
              <div>
                <h4>More</h4>
                <a href="/summercamp">Summer camp</a>
                <a href="/annual-function">Annual function</a>
                <a href="/pay">Make a payment</a>
                <a href="https://admin.eurokidsjmdenclave.org/staff">For teachers</a>
              </div>
            </div>

            <div className="foot-rule" />
            <div className="foot-fine">
              <span>
                © {new Date().getFullYear()} Veena Educational Services. An authorised franchise of
                EuroKids International.
              </span>
              <nav>
                <a href="/terms">Terms</a>
                <a href="/refund-policy">Refunds</a>
                <a href="/privacy">Privacy</a>
              </nav>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
