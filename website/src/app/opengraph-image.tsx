// The picture that appears when somebody shares the site.
//
// There wasn't one. Every link to this school pasted into a WhatsApp group
// — which is how a preschool actually spreads in Undri — arrived as a grey
// box with a line of text. For a business whose referrals travel through
// parent groups that is the single cheapest thing on this list to fix.
//
// Generated at build rather than drawn once in Canva, so the day the claims
// change the card changes with them.

import { ImageResponse } from "next/og";
import { SCHOOL } from "@/lib/local";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SCHOOL.name} — preschool and day care in Undri, Pune`;

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FF2217",
          color: "#fff",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 2, opacity: 0.9 }}>
          ADMISSIONS OPEN 26–27
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 86, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>
            EuroKids JMD Enclave
          </div>
          <div style={{ display: "flex", fontSize: 38, marginTop: 18, opacity: 0.92 }}>
            Preschool &amp; day care in Undri, Pune
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, fontSize: 27, opacity: 0.92 }}>
          <div style={{ display: "flex" }}>{SCHOOL.award}</div>
          <div style={{ display: "flex" }}>{SCHOOL.playArea} play area</div>
          <div style={{ display: "flex" }}>Est. {SCHOOL.founded}</div>
        </div>
      </div>
    ),
    size
  );
}
