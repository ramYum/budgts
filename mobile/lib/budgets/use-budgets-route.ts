import { useEffect, useRef, useState } from "react";
import { readBudgetsParams, type BudgetsParams } from "./params";

type RawParams = { m?: string | string[]; range?: string | string[]; edit?: string | string[] };
type SetParams = (params: { m?: string; range?: BudgetsParams["range"]; edit?: undefined }) => void;

/**
 * What the Budgets screen shows (month, range, the open category sheet), kept in step with its route params the way the
 * web keeps them in the URL: a link applies its params as a web navigation to /budgets?… would, and the params follow
 * what is on screen (a month or range change writes `m` and `range` back, closing a sheet drops `edit`). So every link,
 * even one to the same month and category as the last, is a real change and reopens its sheet.
 */
export function useBudgetsRoute(raw: RawParams, currentMonth: string, setParams: SetParams) {
  const initial = readBudgetsParams(raw, currentMonth);
  const [month, setMonth] = useState(initial.month);
  const [range, setRange] = useState(initial.range);
  const [detail, setDetail] = useState<{ id: string; editing: boolean } | null>(initial.edit ? { id: initial.edit, editing: true } : null);

  const linked = `${String(raw.m ?? "")}|${String(raw.range ?? "")}|${String(raw.edit ?? "")}`;
  const applied = useRef(linked);
  useEffect(() => {
    if (linked === applied.current) return;
    applied.current = linked;
    const next = readBudgetsParams(raw, currentMonth);
    setMonth(next.month);
    setRange(next.range);
    setDetail(next.edit ? { id: next.edit, editing: true } : null);
    // `linked` is the params' identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  return {
    month,
    range,
    detail,
    /** stepping the month returns to This month, as the web's month links do */
    showMonth(m: string) {
      setMonth(m);
      setRange("month");
      setParams({ m, range: "month" });
    },
    showRange(r: BudgetsParams["range"]) {
      setRange(r);
      setParams({ m: month, range: r });
    },
    openDetail(id: string, editing: boolean) {
      setDetail({ id, editing });
    },
    closeDetail() {
      setDetail(null);
      setParams({ edit: undefined });
    },
  };
}
