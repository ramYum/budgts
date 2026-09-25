/** Re-mounts on every navigation inside the dashboard, so each screen arrives
 * with the same short rise-in (globals.css `.page-enter`; off under
 * prefers-reduced-motion). No data or state lives here. */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
