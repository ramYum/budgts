import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const syncTimeZone = vi.fn();
vi.mock("@/server/time-zone", () => ({ syncTimeZone: (zone: string) => syncTimeZone(zone) }));

import { TimeZoneSync } from "./time-zone-sync";

/** Pretend the device is set to `zone`. */
function setDeviceZone(zone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), timeZone: zone };
  });
}

/** The app going to the background and coming back. */
async function foreground() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("TimeZoneSync", () => {
  beforeEach(() => {
    syncTimeZone.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays quiet when the device is in the stored zone", async () => {
    setDeviceZone("America/New_York");
    await act(async () => {
      render(<TimeZoneSync stored="America/New_York" />);
    });
    await foreground();
    expect(syncTimeZone).not.toHaveBeenCalled();
  });

  it("stores the device's zone when it differs from the stored one", async () => {
    setDeviceZone("Asia/Tokyo");
    await act(async () => {
      render(<TimeZoneSync stored="America/New_York" />);
    });
    expect(syncTimeZone).toHaveBeenCalledTimes(1);
    expect(syncTimeZone).toHaveBeenCalledWith("Asia/Tokyo");
  });

  it("fills in a missing zone", async () => {
    setDeviceZone("Europe/London");
    await act(async () => {
      render(<TimeZoneSync stored={null} />);
    });
    expect(syncTimeZone).toHaveBeenCalledWith("Europe/London");
  });

  it("notices a new zone when the app comes back to the foreground", async () => {
    setDeviceZone("America/New_York");
    await act(async () => {
      render(<TimeZoneSync stored="America/New_York" />);
    });
    expect(syncTimeZone).not.toHaveBeenCalled();

    // The user lands in Los Angeles and reopens the app.
    vi.restoreAllMocks();
    setDeviceZone("America/Los_Angeles");
    await foreground();
    expect(syncTimeZone).toHaveBeenCalledWith("America/Los_Angeles");
  });

  it("does not resend a zone the server refused on every foreground event", async () => {
    syncTimeZone.mockResolvedValue({ ok: false, error: "Not a time zone" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setDeviceZone("Asia/Tokyo");
    await act(async () => {
      render(<TimeZoneSync stored="America/New_York" />);
    });
    await foreground();
    await foreground();
    expect(syncTimeZone).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
  });

  it("ignores foreground events while the app is hidden", async () => {
    setDeviceZone("Asia/Tokyo");
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      render(<TimeZoneSync stored="America/New_York" />);
    });
    expect(syncTimeZone).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    await foreground();
    expect(syncTimeZone).toHaveBeenCalledWith("Asia/Tokyo");
  });
});
