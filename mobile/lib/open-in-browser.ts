/** What a screen says when a page won't open in the in-app browser (no browser, the OS refused). */
export const LINK_FAILED = "Couldn't open that page. Try again in a moment.";

/** Opens a page in the in-app browser (`WebBrowser.openBrowserAsync`); its failure in words, or null. Never throws. */
export async function openInBrowser(url: string, open: (url: string) => Promise<unknown>): Promise<string | null> {
  try {
    await open(url);
    return null;
  } catch {
    return LINK_FAILED;
  }
}
