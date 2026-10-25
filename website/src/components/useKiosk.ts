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
// Frames are kept warm rather than taken on demand. Drawing a canvas and
// encoding a JPEG is only a few milliseconds, but on an older iPad those
// milliseconds land on the Submit tap, which is the one moment the thing has
// to feel instant.
//
// It keeps several, not one, and that is the point. Taking the photograph at
// the tap is the worst possible instant to take it: the hand is already
// moving, the tablet is being turned back towards the desk, and what you get
// is a blurred ceiling. The version before this read the single most recent
// frame, which could be two seconds stale and just as likely to be the
// swing. So the camera samples about once a second into a short rolling
// buffer, scores each frame as it arrives, and Submit asks for the best one
// from the seconds *before* the tap — while the family was still standing
// there reading the last question.
//
// Scoring is deliberately crude: mean brightness to throw out a frame that
// is a dark smear or a blown-out window, and horizontal edge energy on a
// 64x48 greyscale thumbnail as a stand-in for sharpness, since a blurred
// frame has far less of it than a still one. It costs about a tenth of a
// millisecond and it is only ever choosing between frames of the same scene,
// which is the one job it has to be right about.
export function useIntakeCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"off" | "starting" | "ready" | "denied">("off");
  // Why it failed, in the browser's own words. Not decoration: the camera
  // can be refused by the person, by the device having none, or by a
  // Permissions-Policy header that stops the prompt ever appearing — and the
  // last of those is invisible from the tablet unless something says so.
  const [reason, setReason] = useState<string | null>(null);
  // Asking again. A refusal is not always final: the permission can be
  // granted from the address bar afterwards, and Safari wants a tap before
  // it will open a camera at all.
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    setState("starting");
    setReason(null);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser offers no camera here (an insecure page, or an old browser).");
        }
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
      } catch (e) {
        // No camera, or permission refused. The form still works: an enquiry
        // without a photograph is worth far more than no enquiry. But it no
        // longer fails invisibly — the tablet is told, so whoever set it up
        // can fix it rather than discovering months of photoless walk-ins.
        const err = e as { name?: string; message?: string };
        setReason(
          err?.name === "NotAllowedError"
            ? "The camera was refused. Allow it from the address bar, or check the site's permissions."
            : err?.name === "NotFoundError"
              ? "This device reports no camera."
              : err?.message || "The camera would not start.",
        );
        setState("denied");
      }
    })();

    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      videoRef.current = null;
    };
  }, [enabled, attempt]);

  // The last few seconds, newest last. Eight frames of ~60 KB is half a
  // megabyte held in memory, which is nothing, and it is thrown away the
  // moment the form resets.
  type Frame = { url: string; at: number; score: number };
  const buf = useRef<Frame[]>([]);
  const KEEP = 8;
  const EVERY = 900;          // about a frame a second
  const SETTLE = 600;         // ignore the last moments before the tap
  const WINDOW = 12_000;      // and anything older than this

  useEffect(() => {
    if (!enabled || state !== "ready") return;
    const tick = () => {
      const f = grab();
      if (!f) return;
      buf.current.push(f);
      if (buf.current.length > KEEP) buf.current.shift();
    };
    tick();
    const id = window.setInterval(tick, EVERY);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state]);

  // The picture to send.
  //
  // Everything from the last twelve seconds except the moment of the tap
  // itself, best score wins. If the buffer holds nothing old enough — a
  // family who filled the whole form in four seconds, or a camera that only
  // just came up — it falls back to the most recent frame rather than
  // sending nothing, because a blurred photograph still answers "was anybody
  // standing there" and no photograph answers nothing.
  const best = (): string | null => {
    const now = Date.now();
    const all = buf.current;
    if (!all.length) return null;
    const settled = all.filter((f) => now - f.at >= SETTLE && now - f.at <= WINDOW);
    const pool = settled.length ? settled : all;
    return pool.reduce((a, b) => (b.score > a.score ? b : a)).url;
  };

  // Clear the held frames. The tablet is handed from family to family, so
  // one family's photograph must not be able to end up on the next one's
  // enquiry if the camera stops between them.
  const forget = () => { buf.current = []; };

  // One frame, as a data URL, with a rough quality score. 720 wide is plenty
  // to recognise a face and lands around 60 KB, which matters when it rides
  // along inside the form's own request.
  const grab = (): Frame | null => {
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
      return { url: c.toDataURL("image/jpeg", 0.72), at: Date.now(), score: score(v) };
    } catch {
      return null;
    }
  };

  // How sharp this frame is, on a 160x120 greyscale thumbnail.
  //
  // The variance of the Laplacian, which is the standard way to tell a
  // photograph from a smear: the Laplacian responds to how fast brightness
  // is changing, and blurring is precisely the operation that flattens that,
  // so a still frame has a wide spread of responses and a swung one has
  // almost none. I tried the cheaper thing first — summing the difference
  // between neighbouring pixels — and measured it against the same scene
  // blurred by hand: it fell by 1% at a three-pixel blur, which is to say it
  // could not tell them apart at all. This falls by 86%.
  //
  // Brightness gates it, because a thumb over the lens and a window blowing
  // out the exposure both give a flat frame that is not worth keeping, and
  // neither is distinguishable by sharpness alone.
  //
  // 160x120 rather than the full frame: a quarter of a millisecond, once a
  // second, and the thumbnail keeps enough detail for the comparison. It is
  // only ever choosing between frames of the same scene seconds apart.
  const score = (v: HTMLVideoElement): number => {
    try {
      const w = 160, h = 120;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return 0;
      ctx.drawImage(v, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const lum = new Float32Array(w * h);
      let mean = 0;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        lum[p] = l; mean += l;
      }
      mean /= w * h;
      if (mean < 22 || mean > 242) return 0;   // a thumb over the lens, or a blown window

      // Running sums rather than an array of responses: same variance, no
      // allocation on a timer that fires all day.
      let sum = 0, sumSq = 0, n = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          const lap = 4 * lum[p] - lum[p - 1] - lum[p + 1] - lum[p - w] - lum[p + w];
          sum += lap; sumSq += lap * lap; n++;
        }
      }
      if (!n) return 0;
      const m = sum / n;
      return sumSq / n - m * m;
    } catch {
      return 0;
    }
  };

  return { state, best, forget, reason, retry };
}
