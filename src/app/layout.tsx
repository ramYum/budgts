import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Budgts",
    template: "%s · Budgts",
  },
  description:
    "Simple money tools, clear insights, and encouragement for a brighter tomorrow.",
  applicationName: "Budgts",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Budgts",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#fff8f0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
