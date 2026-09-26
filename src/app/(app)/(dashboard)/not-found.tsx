import { NotFoundView } from "@/components/not-found-view";

/** A missing page inside the app: the shell stays, the view explains. */
export default function DashboardNotFound() {
  return (
    <div className="md:pt-24">
      <NotFoundView />
    </div>
  );
}
