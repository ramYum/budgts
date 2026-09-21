import { describe, expect, it } from "vitest";
import { NATIVE_LINK_PATH, appleAppSiteAssociation, assetLinks } from "./native-links";

const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

describe("appleAppSiteAssociation", () => {
  it("claims only the native return path for the configured app id", () => {
    const body = appleAppSiteAssociation({ APPLE_APP_ID: "ABCDE12345.com.budgts.app" });
    expect(body).toEqual({
      applinks: {
        apps: [],
        details: [{ appIDs: ["ABCDE12345.com.budgts.app"], components: [{ "/": NATIVE_LINK_PATH }] }],
      },
    });
  });

  it("answers null (404) until an app id is configured — never a guessed one", () => {
    expect(appleAppSiteAssociation({})).toBeNull();
    expect(appleAppSiteAssociation({ APPLE_APP_ID: "  " })).toBeNull();
  });

  it("rejects a malformed app id instead of publishing it", () => {
    expect(appleAppSiteAssociation({ APPLE_APP_ID: "com.budgts.app" })).toBeNull(); // no team id
    expect(appleAppSiteAssociation({ APPLE_APP_ID: "abcde12345.com.budgts.app" })).toBeNull(); // team ids are upper-case
    expect(appleAppSiteAssociation({ APPLE_APP_ID: "ABCDE12345.com budgts" })).toBeNull();
  });
});

describe("assetLinks", () => {
  it("publishes the package and its signing fingerprints", () => {
    expect(assetLinks({ ANDROID_PACKAGE_NAME: "com.budgts.app", ANDROID_CERT_SHA256: FP })).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "com.budgts.app", sha256_cert_fingerprints: [FP] },
      },
    ]);
  });

  it("supports several fingerprints (upload key + Play app-signing key) and normalises case", () => {
    const lower = FP.toLowerCase();
    const r = assetLinks({ ANDROID_PACKAGE_NAME: "com.budgts.app", ANDROID_CERT_SHA256: `${lower}, ${FP}` });
    expect(r?.[0].target.sha256_cert_fingerprints).toEqual([FP, FP]);
  });

  it("answers null (404) unless both package and at least one valid fingerprint are configured", () => {
    expect(assetLinks({})).toBeNull();
    expect(assetLinks({ ANDROID_PACKAGE_NAME: "com.budgts.app" })).toBeNull();
    expect(assetLinks({ ANDROID_CERT_SHA256: FP })).toBeNull();
  });

  it("rejects malformed values instead of publishing them", () => {
    expect(assetLinks({ ANDROID_PACKAGE_NAME: "not a package", ANDROID_CERT_SHA256: FP })).toBeNull();
    expect(assetLinks({ ANDROID_PACKAGE_NAME: "com.budgts.app", ANDROID_CERT_SHA256: "12:34" })).toBeNull();
    expect(assetLinks({ ANDROID_PACKAGE_NAME: "com.budgts.app", ANDROID_CERT_SHA256: `${FP}, zz` })).toBeNull();
  });
});
