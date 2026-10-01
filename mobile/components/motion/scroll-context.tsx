import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { ScrollView, View } from "react-native";

/**
 * What a screen's scroll view tells the blocks inside it, so a block that
 * starts below the fold can wait and play as it scrolls into view (the web's
 * IntersectionObserver in reveal.tsx). Event-driven: listeners hear scroll
 * events and the viewport's size, nothing polls.
 */
export type ScrollWatch = {
  /** the scroll content view, which blocks measure themselves against */
  contentRef: RefObject<View | null>;
  /** the visible height and the current offset */
  viewport: () => { height: number; y: number };
  /** called on every scroll and on the first layout; returns the unsubscribe */
  subscribe: (listener: () => void) => () => void;
  /**
   * scrolls so the content's `y` (measured against `contentRef`) is at the top of the view (a web `#anchor` link).
   * Optional, so a hand-made watch (a test's) needn't provide it; `useScrollWatchSource` always does.
   */
  scrollTo?: (y: number, animated: boolean) => void;
};

const ScrollContext = createContext<ScrollWatch | null>(null);

export function useScrollWatch(): ScrollWatch | null {
  return useContext(ScrollContext);
}

/** The screen side: owns the listeners and the latest viewport. */
export function useScrollWatchSource() {
  const contentRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const state = useRef({ height: 0, y: 0 });
  const listeners = useRef(new Set<() => void>());
  const watch = useMemo<ScrollWatch>(
    () => ({
      contentRef,
      viewport: () => state.current,
      subscribe: (l) => {
        listeners.current.add(l);
        return () => void listeners.current.delete(l);
      },
      scrollTo: (y, animated) => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated }),
    }),
    [],
  );
  const emit = () => {
    for (const l of [...listeners.current]) l();
  };
  return {
    watch,
    scrollRef,
    onScrollY: (y: number) => {
      state.current = { ...state.current, y };
      emit();
    },
    onViewportHeight: (height: number) => {
      state.current = { ...state.current, height };
      emit();
    },
  };
}

export function ScrollWatchProvider({ watch, children }: { watch: ScrollWatch; children: ReactNode }) {
  return <ScrollContext.Provider value={watch}>{children}</ScrollContext.Provider>;
}
