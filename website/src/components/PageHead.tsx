// The top of every page, built the same way each time.
//
// Eyebrow, headline, lead. Nothing else goes here. Each page used to
// improvise its own header — different sizes, different margins, the
// eyebrow present on two pages and missing on three — and a set of pages
// that each introduce themselves differently does not read as one site,
// however good any single page is.
//
// `display` is for the one page that gets the largest size on the scale.
// Everywhere else the headline is an h1 at step 4, so the hierarchy between
// the front page and the rest is real and visible.

export default function PageHead({
  eyebrow,
  title,
  lead,
  display = false,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  display?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="phead">
      {eyebrow ? (
        <p className="eyebrow" data-reveal style={{ ["--i" as string]: 0 }}>
          {eyebrow}
        </p>
      ) : null}
      <h1 className={display ? "display" : undefined} data-reveal style={{ ["--i" as string]: 1 }}>
        {title}
      </h1>
      {lead ? (
        <p className="lead" data-reveal style={{ ["--i" as string]: 2 }}>
          {lead}
        </p>
      ) : null}
      {children ? (
        <div className="phead-after" data-reveal style={{ ["--i" as string]: 3 }}>
          {children}
        </div>
      ) : null}
    </header>
  );
}
