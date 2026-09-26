import { notFound } from "next/navigation";

/** Any path the app doesn't have lands here, inside the signed-in shell, so
 * the 404 keeps the sidebar and tabs as its way back (not-found.tsx). */
export default function MissingPage() {
  notFound();
}
