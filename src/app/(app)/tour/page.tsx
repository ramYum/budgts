import { redirect } from "next/navigation";

/**
 * Entry point of the "How Budgts Works" walkthrough. Kept at `/tour` because
 * the onboarding action and the dashboard's first-run gate both send users
 * here (`redirect("/tour")`, `redirect("/tour?new=1")`); it simply starts the
 * walkthrough at its first step. Auth, onboarding and first-run/revisit
 * handling all live in `/tour/[topic]`.
 */
export default function TourPage() {
  redirect("/tour/organize");
}
