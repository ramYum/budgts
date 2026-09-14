import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 bg-bg p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="brand-mascot-stage flex flex-col items-center gap-2 px-8 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, decorative */}
          <img
            src="/brand/logo-sunburst.png"
            alt=""
            width={516}
            height={376}
            style={{ width: 315, height: "auto" }}
          />
          <Logo mark={false} size={36} />
        </div>
        {children}
      </div>
    </main>
  );
}
