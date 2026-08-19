"use client";

import { useEffect, useState } from "react";
import { gameSound } from "@/lib/sound-engine";

export default function SoundControl() {
  const [muted, setMuted] = useState(() => gameSound.isMuted());

  useEffect(() => {
    const unlock = () => gameSound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <button
      className={`sound-control ${muted ? "muted" : ""}`}
      suppressHydrationWarning
      type="button"
      onClick={() => {
        const next = !muted;
        gameSound.setMuted(next);
        setMuted(next);
      }}
      aria-label={muted ? "Attiva effetti sonori" : "Disattiva effetti sonori"}
      title={muted ? "Attiva effetti sonori" : "Disattiva effetti sonori"}
    >
      <span aria-hidden="true">{muted ? "◖" : "◖))"}</span>
      <small>{muted ? "SUONI OFF" : "SUONI ON"}</small>
    </button>
  );
}
