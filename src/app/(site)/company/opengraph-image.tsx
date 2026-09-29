import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { robinSvg } from "@/lib/brand/robin-art";

/** The homepage's share card (Open Graph and X): the robin, the Dogica wordmark and the line, charcoal on light gray
 * with the one red accent. Rendered once at build time. Reading type is Geist: the headline in SemiBold as on the page
 * (src/app/fonts/geist, SIL OFL 1.1), the line under it in the Regular next/og itself bundles, named here because a
 * custom font list replaces its default. */
export const alt = "Budgts: budgeting that does itself. Coming soon to iPhone and Android.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#111111";
const MUTED = "#6E6E6E";
const SIGNAL = "#E54848";

export default async function OpenGraphImage() {
  const [dogica, geist, geistSemiBold] = await Promise.all([
    readFile(join(process.cwd(), "src/app/fonts/dogica/dogicabold.ttf")),
    readFile(join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "src/app/fonts/geist/Geist-SemiBold.ttf")),
  ]);
  // 10px a cell: the robin at an integer scale, as the brand requires of raster exports
  const robin = `data:image/svg+xml;base64,${Buffer.from(robinSvg({ size: 280, scale: 10 })).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 96px",
          background: "#F4F4F4",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Dogica", fontSize: 48, color: INK }}>Budgts</div>
          <div style={{ display: "flex", marginTop: 32, fontFamily: "Dogica", fontSize: 16, color: MUTED }}>
            TRACK <span style={{ color: SIGNAL, margin: "0 12px" }}>:</span> PLAN{" "}
            <span style={{ color: SIGNAL, margin: "0 12px" }}>:</span> GROW
          </div>
          <div style={{ display: "flex", width: 48, height: 4, marginTop: 40, background: SIGNAL }} />
          <div style={{ display: "flex", marginTop: 40, fontSize: 52, fontWeight: 600, letterSpacing: -1.2, color: INK }}>
            Budgeting that does itself.
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 30, color: MUTED }}>
            Coming soon to iPhone and Android
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain elements, not next/image */}
        <img src={robin} width={280} height={280} alt="" />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: geist, style: "normal", weight: 400 },
        { name: "Geist", data: geistSemiBold, style: "normal", weight: 600 },
        { name: "Dogica", data: dogica, style: "normal", weight: 400 },
      ],
    },
  );
}
