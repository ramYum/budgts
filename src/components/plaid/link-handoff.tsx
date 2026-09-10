"use client";

import { useEffect, useRef } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";

/**
 * Opens Plaid Link for a freshly minted `link_token` and hands the resulting
 * `public_token` back. Rendered only once a token exists, and auto-opens the
 * hosted Link UI as soon as it's ready — the parent owns the surrounding flow.
 */
export function LinkHandoff({
  linkToken,
  onSuccess,
  onExit,
}: {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      if (publicToken) onSuccess(publicToken, metadata);
    },
    onExit: () => onExit(),
  });

  const openedRef = useRef(false);
  useEffect(() => {
    if (ready && !openedRef.current) {
      openedRef.current = true;
      open();
    }
  }, [ready, open]);

  return null;
}
