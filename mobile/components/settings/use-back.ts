import { useRouter, type Href } from "expo-router";

/**
 * A pushed screen's back arrow: back through the stack, or, when the screen
 * was opened directly (a deep link), to the web `BackLink`'s destination.
 */
export function useBack(fallback: Href): () => void {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.navigate(fallback));
}
