import { describe, expect, it, vi } from "vitest";
import { flat, hosts, render } from "../../test/render";
import { HEADER_BLUR, Screen } from "./screen";

vi.mock("expo-router", () => ({ useRouter: () => ({ push: () => {}, navigate: () => {} }) }));
vi.mock("../../lib/status/status-context", () => ({ useStatus: () => ({ needsCategoryCount: 2, review: { advisory: null, excluded: null }, deletionInProgress: false }) }));

describe("Screen's sticky header (web bg-bg/90 backdrop-blur-xl)", () => {
  it("draws the header over a backdrop blur of the content, which scrolls under it", () => {
    const r = render(
      <Screen>
        <></>
      </Screen>,
    );
    const scroll = hosts(r, "ScrollView")[0]!;
    expect(flat(scroll.props.contentContainerStyle).paddingTop).toBe(56);
    const blur = r.root.findAll((n) => n.props.blurTarget !== undefined)[0]!;
    expect(blur.props).toMatchObject(HEADER_BLUR);
    expect(HEADER_BLUR.intensity / 4).toBeGreaterThanOrEqual(24); // Android: radius = intensity ÷ reduction 4, the web's 24px
    expect(r.root.findAll((n) => n.props.testID === "app-header" && typeof n.type === "string")).toHaveLength(1);
  });
});
