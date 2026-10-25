"use client";

import { useKiosk } from "./useKiosk";

// Is this device the reception tablet?
//
// It matters, and until now there was no way to tell. Without the kiosk key
// the form still works perfectly — it just records every family as a website
// enquiry and takes no photograph. Nothing looks wrong. You find out in
// March that a month of walk-ins are filed as web leads.
//
// The failure is easy to walk into: install the app from the plain address
// rather than the kiosk link, clear the browser's data, or set the tablet up
// as a new user. So the tablet says so, quietly, under the form.
//
// Nothing at all on anybody else's device. This is the public home page: a
// parent on their own phone must not be told they are not a reception
// tablet, and must not be shown anything that invites them to become one.
export default function KioskStatus() {
  const key = useKiosk();
  if (!key) return null;
  return <p className="kiosk-state">Reception tablet &middot; walk-in</p>;
}
