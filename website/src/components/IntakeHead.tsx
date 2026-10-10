"use client";

import { useKiosk } from "./useKiosk";

// The same page says two different things depending on where it is being
// read. On the tablet at reception the family is already standing in the
// building, so "come and see us" is nonsense and "we will call you to
// arrange a visit" is worse — they arranged it by walking in.
export default function IntakeHead() {
  const kiosk = !!useKiosk();

  return (
    <div className="tf-head">
      <span className="tf-kicker">
        {kiosk ? "Welcome to EuroKids JMD Enclave" : "Admissions open 26-27 · Undri, Pune"}
      </span>
      <h1 className="tf-title">
        {kiosk ? "Tell us about your little one." : "Come and see us."}
      </h1>
      <p className="tf-sub">
        {kiosk
          ? "A few questions while you are here, so we have everything on record and nobody has to write it twice."
          : "A few quick questions and we will call you to arrange a visit."}
      </p>
    </div>
  );
}
