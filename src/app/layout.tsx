import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const nunito = Nunito_Sans({
  variable: "--font-nunito",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Budgt",
    template: "%s · Budgt",
  },
  description:
    "Simple money tools, clear insights, and encouragement for a brighter tomorrow.",
  applicationName: "Budgt",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Budgt",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f3f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1159" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
