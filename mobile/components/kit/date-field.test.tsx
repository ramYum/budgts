import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render, texts } from "../../test/render";

const picker = vi.hoisted(() => ({ opened: [] as { value: Date; onChange: (e: { type: string }, d?: Date) => void }[] }));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: (o: (typeof picker.opened)[number]) => picker.opened.push(o) },
}));

const { ProfileContext } = await import("../../lib/profile/profile-hooks");
type ProfileContextValue = import("../../lib/profile/profile-hooks").ProfileContextValue;
const { DateField, dateToDay, dayToDate, formatDateInput } = await import("./date-field");

describe("DateField (the web's <input type=date>)", () => {
  it("shows the day as Android Chrome does and round-trips the server's YYYY-MM-DD in any time zone", () => {
    expect(formatDateInput("2026-09-30")).toBe("09/30/2026");
    expect(dateToDay(dayToDate("2026-01-01"))).toBe("2026-01-01");
    expect(dateToDay(dayToDate("2028-02-29"))).toBe("2028-02-29");
  });

  it("opens the Material date dialog on Android and answers the chosen day", () => {
    const set = vi.fn();
    const r = render(<DateField testID="date" label="Date" value="2026-09-30" onChange={set} />);
    expect(texts(r)).toEqual(["Date", "09/30/2026"]);
    act(() => r.root.findAll((n) => n.props.testID === "date" && typeof n.type === "string")[0]!.props.onPress());
    const opened = picker.opened.at(-1)!;
    expect(dateToDay(opened.value)).toBe("2026-09-30");
    opened.onChange({ type: "set" }, new Date(2026, 9, 2));
    expect(set).toHaveBeenCalledWith("2026-10-02");
    opened.onChange({ type: "dismissed" });
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("an empty optional date shows the web's placeholder", () => {
    expect(texts(render(<DateField label="Target date" value={null} onChange={() => {}} />))).toEqual(["Target date", "mm/dd/yyyy"]);
  });

  it("with nothing chosen, the picker opens on the user's own today (the profile's zone), not the device's", () => {
    const profile = { state: { status: "ready", profile: { month: "2026-10", today: "2026-10-01" } } } as unknown as ProfileContextValue;
    const r = render(
      <ProfileContext.Provider value={profile}>
        <DateField testID="target" label="Target date" value={null} onChange={() => {}} />
      </ProfileContext.Provider>,
    );
    act(() => r.root.findAll((n) => n.props.testID === "target" && typeof n.type === "string")[0]!.props.onPress());
    expect(dateToDay(picker.opened.at(-1)!.value)).toBe("2026-10-01");
  });
});
