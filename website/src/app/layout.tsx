import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import Header from "@/components/Header";
import Reveal from "@/components/Reveal";
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
    "EuroKids JMD Enclave, Undri — preschool and day care in Pune. Est. 2017, trusted by 3000+ parents, 5,000 sq ft of play area. Admissions open for 26-27.",
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
  telephone: "+91-22-6962-2686",
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
  areaServed: ["Undri", "NIBM", "Mohammadwadi", "Pisoli", "Kondhwa", "Hadapsar"],
  // Coordinates let a search engine place the school on a map instead of
  // inferring it from the address line, which is what the "near me"
  // searches are resolved against.
  geo: { "@type": "GeoCoordinates", latitude: 18.4575, longitude: 73.9165 },
  hasMap:
    "https://www.google.com/maps/search/?api=1&query=EuroKids+JMD+Enclave+Undri+Pune",
  award: "Best Ambience Award",
  // The founder as a real entity, so an answer engine asked "who runs
  // EuroKids JMD Enclave" has a named person to return rather than
  // guessing from a directory listing. Name and role only — there is no
  // published biography to draw on and inventing one for a named person
  // is not something a school's own website should do.
  founder: {
    "@type": "Person",
    name: "Neeta Saxena",
    jobTitle: "Founder",
    worksFor: { "@type": "Preschool", name: "EuroKids JMD Enclave" },
  },
  slogan: "Choose the best.",
  sameAs: ["https://www.instagram.com/eurokidsjmdenclave/"],
  numberOfEmployees: { "@type": "QuantitativeValue", minValue: 10 },
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

// Half a laurel wreath, drawn rather than shipped as an image.
//
// The first version of this was two CSS pseudo-elements with a rounded corner
// each, which read as stray brackets around the text rather than as laurels.
// A branch needs a stem and leaves, and that is a path, not a border radius.
//
// One component, mirrored with a transform for the right-hand side, so the two
// sides can never drift apart.
function Laurel({ flip = false }: { flip?: boolean }) {
  // Six leaves climbing the outside of the stem. Each is the same ellipse,
  // walked up the curve and turned to sit against it.
  const leaves: Array<[number, number, number]> = [
    [11.5, 37, -62],
    [8.4, 31, -74],
    [6.6, 24.5, -86],
    [6.4, 18, -98],
    [8, 11.8, -112],
    [11, 6.4, -126],
  ];
  return (
    <svg
      className="laurel"
      viewBox="0 0 22 44"
      width="13"
      height="26"
      aria-hidden="true"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M16.5 42.5C8.5 37 5 29 5.6 20.5 6.1 12.6 10.4 6 16 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
      {leaves.map(([x, y, a], i) => (
        <ellipse
          key={i}
          cx="0"
          cy="0"
          rx="4.1"
          ry="1.85"
          fill="currentColor"
          transform={`translate(${x} ${y}) rotate(${a})`}
        />
      ))}
    </svg>
  );
}

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
        <Reveal />
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
              {[
                <>Best Ambience Award</>,
                <><b>№1</b> Preschool In Undri</>,
                <>5000 Sqft Play Area</>,
                <>250+ 5-star reviews</>,
              ].map((claim, i) => (
                <li key={i}>
                  <Laurel />
                  <span>{claim}</span>
                  <Laurel flip />
                </li>
              ))}
            </ul>

            <a
              className="foot-follow"
              href="https://www.instagram.com/eurokidsjmdenclave/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Follow Us
            </a>

            {/* Internal links, which are how a search engine finds the
                pages that are not in the top nav — and how a parent who
                landed on the refund policy from Google gets to the thing
                they were actually looking for. */}
            <nav className="foot-more" aria-label="More pages">
              <a href="/preschool-in-undri">Preschool in Undri</a>
              <a href="/daycare-in-undri">Day care in Undri</a>
              <a href="/preschool-in-mohammadwadi">Near Mohammadwadi &amp; NIBM</a>
              <a href="/programmes">Programmes</a>
              <a href="/faq">Questions parents ask</a>
              <a href="/summercamp">Summer camp</a>
              <a href="/annual-function">Annual function</a>
              <a href="/contact-us">Contact</a>
            </nav>

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
