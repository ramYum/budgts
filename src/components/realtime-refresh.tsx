import { RealtimeRefreshListener } from "./realtime-refresh-listener";

/**
 * Live refresh for changes made outside this tab (background bank sync,
 * another device). Server component: stamps the render time so the listener
 * can skip events the rendered page already includes — notably the echo of
 * the user's own server-action edits, which revalidatePath has already
 * re-rendered. See realtime-refresh-listener.tsx.
 */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  return <RealtimeRefreshListener tables={tables} renderedAt={renderedAt()} />;
}

/** Server wall-clock at render; compared with Postgres commit timestamps. */
function renderedAt(): number {
  return Date.now();
}
