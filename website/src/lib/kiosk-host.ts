// Which address you arrived at decides which site you get.
//
// There are two, and they are the same pages:
//
//   eurokidsjmdenclave.org          the public site. No camera, ever. A form
//                                   filled in here is a Website enquiry.
//   kiosk.eurokidsjmdenclave.org    the reception tablet. Asks for the camera
//                                   and records a Walk In.
//
// Before this, both lived at one address and the difference was ?kiosk=<key>
// in the query string — which meant the public site shipped a page that could
// ask a parent at home for their camera, and the tablet lost its identity the
// moment somebody opened it from the home screen without the query string.
//
// Deliberately a prefix test on the hostname and nothing cleverer. The
// preview deployments need it too, so that the tablet can be set up and
// tested before the DNS for the real subdomain exists.
export const KIOSK_PREFIX = "kiosk.";

export function isKioskHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];          // drop any :port
  return h.startsWith(KIOSK_PREFIX);
}
