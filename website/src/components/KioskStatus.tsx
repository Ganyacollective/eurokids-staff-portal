"use client";

import { useKiosk } from "./useKiosk";

// Is this device actually the reception tablet?
//
// It matters, and until now there was no way to tell. Without the kiosk key
// the form still works perfectly — it just records every family as a website
// enquiry and takes no photograph. Nothing looks wrong. You find out in
// March that a month of walk-ins are filed as web leads.
//
// The failure is easy to walk into: install the app from the plain address
// rather than the kiosk link, clear the browser's data, or set the tablet up
// as a new user. So the page says which it is, quietly, at the bottom where a
// family will not read it but whoever sets the tablet up will.
export default function KioskStatus() {
  const key = useKiosk();
  return (
    <p className={`kiosk-state ${key ? "is-on" : "is-off"}`}>
      {key ? (
        <>Reception tablet &middot; walk-in</>
      ) : (
        <>
          Not set up as the reception tablet. Open the kiosk link once on this
          device (the address ending <code>?kiosk=&hellip;</code>) and it will be
          remembered.
        </>
      )}
    </p>
  );
}
