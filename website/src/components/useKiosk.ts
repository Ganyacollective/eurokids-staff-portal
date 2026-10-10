"use client";

import { useEffect, useRef, useState } from "react";

// The reception tablet.
//
// It is the same page a parent might open at home, with one difference: it
// carries ?kiosk=<key> in its address. That key is what the server checks
// before it will record a walk-in or accept a photograph, so the public web
// can never claim to be the tablet by setting a flag in its own JavaScript.
export function useKiosk() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("kiosk");
    if (k) setKey(k);
  }, []);
  return key;
}

// The camera on the tablet, held open for the day.
//
// This exists because a form anybody can walk up to is a form anybody can
// make up, and the school has had enquiries entered that no family ever made.
// A photograph taken at the moment of submission settles that question.
//
// Two rules it is built around. It only ever runs on the tablet — the hook is
// handed a key or it does nothing at all, so the public website cannot open a
// stranger's camera. And the person is told: the form says a photo will be
// taken, in plain words, before they press the button. A hidden camera would
// also be worse at the actual job, because a member of staff who knows the
// photo is coming does not invent the enquiry in the first place.
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

  // One frame, as a data URL. 720 wide is plenty to recognise a face and
  // lands around 60 KB, which matters when it rides along inside the form's
  // own request.
  const capture = async (): Promise<string | null> => {
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

  return { state, capture };
}
