import { createContext, useContext } from "react";

/** Which way the guide moved to this card: the next card enters from the right, going back from the left. */
export type Direction = "none" | "next" | "back";
export const DirectionContext = createContext<Direction>("none");
export const useDirection = () => useContext(DirectionContext);
