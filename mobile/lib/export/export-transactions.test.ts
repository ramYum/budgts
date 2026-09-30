import { describe, expect, it, vi } from "vitest";
import { EXPORT_FAILED, exportFileName, exportTransactions } from "./export-transactions";

const csv = (status = 200) =>
  new Response("date,amount\n2026-09-01,-12.00\n", {
    status,
    headers: { "Content-Disposition": 'attachment; filename="budgts-transactions-2026-09-30.csv"' },
  });

describe("exportTransactions", () => {
  it("saves the server's CSV under the server's name and shares it", async () => {
    const save = vi.fn(() => "file:///cache/budgts-transactions-2026-09-30.csv");
    const share = vi.fn(async () => {});
    expect(await exportTransactions({ fetchCsv: async () => csv(), save, share })).toEqual({ status: "ok" });
    expect(save).toHaveBeenCalledWith("budgts-transactions-2026-09-30.csv", "date,amount\n2026-09-01,-12.00\n");
    expect(share).toHaveBeenCalledWith("file:///cache/budgts-transactions-2026-09-30.csv");
  });

  it("shares nothing when the server fails, and says so plainly", async () => {
    const share = vi.fn(async () => {});
    expect(await exportTransactions({ fetchCsv: async () => csv(503), save: () => "x", share })).toEqual({ status: "error", message: EXPORT_FAILED });
    expect(share).not.toHaveBeenCalled();
  });

  it("turns a network or share-sheet failure into the same plain message", async () => {
    const boom = async () => {
      throw new Error("getaddrinfo ENOTFOUND api.internal");
    };
    expect(await exportTransactions({ fetchCsv: boom, save: () => "x", share: async () => {} })).toEqual({ status: "error", message: EXPORT_FAILED });
    expect(await exportTransactions({ fetchCsv: async () => csv(), save: () => "x", share: boom })).toEqual({ status: "error", message: EXPORT_FAILED });
  });

  it("never trusts a file name that isn't a plain .csv name", () => {
    expect(exportFileName('attachment; filename="../../etc/passwd"')).toBe("budgts-transactions.csv");
    expect(exportFileName(null)).toBe("budgts-transactions.csv");
  });
});
