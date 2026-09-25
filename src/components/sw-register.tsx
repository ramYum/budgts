"use client";

import { useEffect } from "react";
import { INSTALLABLE_EVENT, type BeforeInstallPromptEvent } from "@/components/install-app";

/** Registers the service worker in production only, and keeps the browser's
 * one-shot install event so the More page can offer an "Install app" button. */
export function SwRegister() {
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep it: shown from the More page, not the default mini-infobar
      window.__budgtsInstallPrompt = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event(INSTALLABLE_EVENT));
    };
    const onInstalled = () => {
      window.__budgtsInstallPrompt = null;
      window.dispatchEvent(new Event(INSTALLABLE_EVENT));
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
