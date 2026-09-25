"use client";

import { useEffect, useState } from "react";

/** The non-standard Chromium install event; captured early by <SwRegister />. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __budgtsInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export const INSTALLABLE_EVENT = "budgts:installable";

type Mode = "hidden" | "prompt" | "ios";

function detectMode(): Mode {
  if (typeof window === "undefined") return "hidden";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "hidden"; // already installed and running as an app
  if (window.__budgtsInstallPrompt) return "prompt";
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  return isIos ? "ios" : "hidden";
}

/**
 * "Install app" card. Chromium (Android, desktop) only offers install through a
 * one-shot `beforeinstallprompt` event that is easy to miss, so the app keeps it
 * and offers a button here. iOS Safari has no install event at all: the only
 * route is Share → Add to Home Screen, so it gets instructions instead.
 */
export function InstallApp() {
  const [mode, setMode] = useState<Mode>("hidden");

  useEffect(() => {
    const update = () => setMode(detectMode());
    update();
    window.addEventListener(INSTALLABLE_EVENT, update);
    return () => window.removeEventListener(INSTALLABLE_EVENT, update);
  }, []);

  if (mode === "hidden") return null;

  async function install() {
    const ev = window.__budgtsInstallPrompt;
    if (!ev) return;
    await ev.prompt();
    await ev.userChoice;
    window.__budgtsInstallPrompt = null; // a prompt event can only be used once
    setMode(detectMode());
  }

  return (
    <section className="card space-y-2 rounded-2xl border border-hairline p-4">
      <h2 className="text-sm font-semibold">Install Budgts</h2>
      {mode === "prompt" ? (
        <>
          <p className="text-sm text-muted">Add Budgts to your home screen to open it like an app.</p>
          <button
            type="button"
            onClick={install}
            className="press rounded-xl bg-primary-btn px-4 py-3 text-sm font-medium text-on-primary-btn"
          >
            Install app
          </button>
        </>
      ) : (
        <p className="text-sm text-muted">
          In Safari, tap the Share button, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </section>
  );
}
