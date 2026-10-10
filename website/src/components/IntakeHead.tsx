"use client";

import { useKiosk } from "./useKiosk";

// Just the welcome, and the school's own mark.
//
// It used to say "Tell us about your little one" over a line explaining that
// this saves us writing things twice — which is our problem, not the
// family's, and no parent should be reading our filing arrangements.
export default function IntakeHead() {
  const kiosk = !!useKiosk();

  return (
    <div className="tf-head">
      <img
        className="tf-logo"
        src="https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/eurokids-logo.png"
        alt="EuroKids Pre-School"
      />
      <h1 className="tf-title">Welcome to EuroKids JMD Enclave</h1>
      {!kiosk && (
        <p className="tf-sub">
          Leave your details and we will call you to arrange a visit.
        </p>
      )}
    </div>
  );
}
