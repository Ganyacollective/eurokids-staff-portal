"use client";

import { useEffect, useRef, useState } from "react";

// The reception tablet.
//
// It is the same page a parent might open at home, with one difference: it
// carries ?kiosk=<key> in its address. That key is what the server checks
// before it will record a walk-in or accept a photograph, so the public web
// can never claim to be the tablet by setting a flag in its own JavaScript.
// The key is remembered on the device once seen, and this is not a nicety.
//
// The tablet is set up by opening the kiosk link and choosing Add to Home
// Screen. But the manifest sets start_url to "/", so the icon launches the
// bare address with no query string — the key is dropped on the very first
// launch. Without remembering it, the home-screen app silently stops being the
// kiosk: no photograph, and every family recorded as a website enquiry rather
// than a walk-in. Nothing breaks visibly; the photos simply never arrive, and
// you find out weeks later.
//
// Remembering it is safe. The key is a secret shared only with the tablet, so
// a browser that has seen it legitimately is the tablet. It stays on that
// device, and clearing the browser's storage undoes it.
const REMEMBERED = "ek-kiosk-key";

export function useKiosk() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("kiosk");

    // ?kiosk=off takes a device out of reception duty. There has to be a way
    // back that is not "clear the browser's site data".
    if (fromUrl === "off" || fromUrl === "") {
      forgetKiosk();
      return;
    }
    if (fromUrl) {
      setKey(fromUrl);
      try { localStorage.setItem(REMEMBERED, fromUrl); } catch { /* private mode */ }
      return;
    }
    try {
      const saved = localStorage.getItem(REMEMBERED);
      if (saved) setKey(saved);
    } catch { /* storage unavailable; the form still works, without a photo */ }
  }, []);
  return key;
}

// Taking a device out of reception duty — run from the address bar on that
// tablet. Without this there is no way back except clearing site data.
export function forgetKiosk() {
  try { localStorage.removeItem(REMEMBERED); } catch { /* nothing to do */ }
}

// The camera on the tablet, held open for the day.
//
// This exists because a form anybody can walk up to is a form anybody can
// make up, and the school has had enquiries entered that no family ever made.
// A photograph taken at the moment of submission settles that question.
//
// It only ever runs on the tablet: the hook is handed a key or it does
// nothing at all, so the public website can never open a stranger's camera.
//
// A frame is kept warm rather than taken on demand. Drawing a canvas and
// encoding a JPEG is only a few milliseconds, but on an older iPad those
// milliseconds land on the Submit tap, which is the one moment the thing has
// to feel instant. So the camera refreshes a frame every couple of seconds in
// the background and Submit simply reads the latest one.
export function useIntakeCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"off" | "starting" | "ready" | "denied">("off");

  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    setState("starting");

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = document.createElement("video");
        v.srcObject = stream;
        v.playsInline = true;
        v.muted = true;
        await v.play().catch(() => {});
        videoRef.current = v;
        setState("ready");
      } catch {
        // No camera, or permission refused. The form still works: an enquiry
        // without a photograph is worth far more than no enquiry.
        setState("denied");
      }
    })();

    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      videoRef.current = null;
    };
  }, [enabled]);

  const frameRef = useRef<string | null>(null);

  // Refresh the held frame while the family is filling the form in. Cheap,
  // and off the critical path.
  useEffect(() => {
    if (!enabled || state !== "ready") return;
    const tick = () => { const f = grab(); if (f) frameRef.current = f; };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state]);

  // Whatever the camera last saw. Null if it never started.
  const latest = () => frameRef.current;

  // One frame, as a data URL. 720 wide is plenty to recognise a face and
  // lands around 60 KB, which matters when it rides along inside the form's
  // own request.
  const grab = (): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    try {
      const w = 720;
      const h = Math.round((v.videoHeight / v.videoWidth) * w);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.72);
    } catch {
      return null;
    }
  };

  return { state, latest };
}
