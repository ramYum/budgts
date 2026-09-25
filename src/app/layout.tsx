import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Dogica by Roberto Mocci, SIL Open Font License 1.1 (./fonts/dogica/OFL-*.txt).
// Brand moments only: the wordmark and a few pixel tags.
const dogicaBold = localFont({
  src: "./fonts/dogica/dogicabold.ttf",
  variable: "--font-dogica-bold",
  display: "swap",
  preload: true,
});
const dogicaPixel = localFont({
  src: "./fonts/dogica/dogicapixel.ttf",
  variable: "--font-dogica-pixel",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Budgts",
    template: "%s · Budgts",
  },
  description: "Track, plan and grow. A calm, precise budget for a brighter tomorrow.",
  applicationName: "Budgts",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Budgts",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f4f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${dogicaBold.variable} ${dogicaPixel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
