import { authFetch } from "../auth/api";
import { useVersion } from "../api/invalidate";
import { loadResource } from "../api/load";
import { useResource } from "../api/use-resource";
import { parseCategories } from "../categories/categories-api";
import { parseActivityExtras } from "./activity-api";

/**
 * The Activity screen's two reads beside the ledger: the panels (`GET /api/mobile/activity`: Needs a category, the
 * limited-history advisory) and the categories its pickers and band use (`GET /api/mobile/categories`). Tabs stay mounted,
 * so both follow the transactions topic: a save, a sync, a categorize, or a category added, renamed or archived in Settings
 * (every category write invalidates it) re-reads them in place, the list staying on screen (useResource's `version`).
 */
export function useActivityPanels() {
  const version = useVersion("transactions");
  const extras = useResource("activity-extras", (s) => loadResource(() => authFetch("/api/mobile/activity", s), parseActivityExtras), {
    version,
  });
  const categories = useResource("activity-categories", (s) => loadResource(() => authFetch("/api/mobile/categories", s), parseCategories), {
    version,
  });
  return { extras, categories };
}
