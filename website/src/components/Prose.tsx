// The shell every written page sits in.
//
// Terms, privacy and the refund policy are the pages nobody wants to read and
// everybody has to, so the only kindness available is making them legible: a
// measure of about 70 characters, generous leading, real headings a person
// can scan, and a last-updated date so it is obvious the page is maintained.
//
// One component rather than three copies, because the day the address changes
// it should change in one place.

import PageHead from "@/components/PageHead";

export default function Prose({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="wrap prose-page">
      <PageHead eyebrow="Legal" title={title} lead={intro}>
        {updated ? <p className="prose-updated">Last updated {updated}</p> : null}
      </PageHead>
      <div className="prose">{children}</div>
      <aside className="prose-foot">
        <h2>Still not sure?</h2>
        <p>
          Call the office on <a href="tel:+912069622686">020 6962 2686</a> or write to{" "}
          <a href="mailto:admin@eurokidsjmdenclave.org">admin@eurokidsjmdenclave.org</a>. We
          would rather answer a question than have you guess.
        </p>
      </aside>
    </div>
  );
}
