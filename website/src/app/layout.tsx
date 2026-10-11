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
  // Two different marks, deliberately. The tab carries the EuroKids logo,
  // because a parent with eleven tabs open should be able to find the school
  // by its badge. The home-screen icon is the blocks mark: a wide wordmark
  // crushed into a rounded square reads as a smudge at any size a phone uses.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  alternates: { canonical: "/" },
  keywords: [
    "preschool in Undri", "playschool Undri Pune", "day care Undri",
    "EuroKids Undri", "nursery admission Pune", "preschool near Nyati",
    "best preschool Undri", "creche Undri Pune",
  ],
  other: { "geo.region": "IN-MH", "geo.placename": "Undri, Pune" },
};

export const viewport: Viewport = {
  themeColor: "#FCF8F6",
  width: "device-width",
  initialScale: 1,
  // Not locked: a parent who needs to zoom in to read the fee line should be
  // able to.
  maximumScale: 5,
};

// Who this is, in the form a search engine reads.
//
// A preschool is a local business before it is a website: the result a parent
// sees should carry the address, the phone number and the hours, not just a
// blue link. Every figure here is one the school already says out loud on its
// own pages — nothing is invented to decorate the markup.
const SCHOOL_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Preschool",
  name: "EuroKids JMD Enclave",
  alternateName: "EuroKids Undri",
  url: "https://eurokidsjmdenclave.org",
  logo: "https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/eurokids-logo.png",
  telephone: "+91-20-6962-2686",
  email: "admin@eurokidsjmdenclave.org",
  foundingDate: "2017",
  parentOrganization: { "@type": "Organization", name: "EuroKids International" },
  address: {
    "@type": "PostalAddress",
    streetAddress: "JMD Enclave, Undri",
    addressLocality: "Pune",
    addressRegion: "Maharashtra",
    postalCode: "411060",
    addressCountry: "IN",
  },
  areaServed: ["Undri", "NIBM", "Mohammadwadi", "Pisoli", "Kondhwa"],
  openingHoursSpecification: [{
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "08:00", closes: "18:30",
  }],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Programmes",
    itemListElement: ["Play Group", "Nursery", "Euro Junior", "Euro Senior", "Day Care", "Summer Camp"]
      .map((n) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: n } })),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${tight.variable}`}>
        {/* Structured data goes in the document, not in a tag manager: it has
            to be in the HTML the crawler is handed. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHOOL_JSONLD) }}
        />
        <Header />
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="wrap">
            {/* The footer that is live on Framer, rebuilt. I had replaced it
                with a three-column link directory — address, "Come and see
                us", "More" — which is a sitemap, not a closing argument. The
                real one closes with the thing a parent is deciding about:
                admissions are open, here is why us, follow us. */}
            <div className="foot-top">
              {/* On white, because the logo's own lettering is EuroKids blue
                  and it disappears into the red otherwise. */}
              <span className="foot-logo">
                <img
                  src="https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/eurokids-logo.png"
                  alt="EuroKids Pre-School"
                />
              </span>
              <p className="foot-name">Eurokids JMD Enclave</p>
              <h2 className="foot-cta">Admissions Open 26-27</h2>
              <p className="foot-sub">Choose the best.</p>
            </div>

            {/* The four claims the old site closed with. They are the reason
                a parent comparing three preschools picks this one, so they
                belong above the legal line rather than buried on a page. */}
            <ul className="foot-awards">
              <li>Best Ambience Award</li>
              <li><b>№1</b> Preschool In Undri</li>
              <li>5000 Sqft Play Area</li>
              <li>200+ 5-star reviews</li>
            </ul>

            <a
              className="foot-follow"
              href="https://www.instagram.com/eurokidsjmdenclave/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Follow Us
            </a>

            <div className="foot-rule" />
            <div className="foot-fine">
              <span>
                © {new Date().getFullYear()} Veena Educational Services.
                <br />
                An authorized franchise of EuroKids International.
              </span>
              <nav>
                <a href="/terms-conditions">Terms and Conditions</a>
                <a href="/refund-cancellation-policy">Refund Policy</a>
                <a href="/privacy-policy">Privacy Policy</a>
                <a href="/contact-us">Contact Us</a>
              </nav>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
