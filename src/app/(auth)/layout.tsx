import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 bg-bg p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="brand-mascot-stage flex flex-col items-center gap-3 px-8 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, decorative */}
          <img src="/brand/icon-badge.png" alt="" width={120} height={120} className="h-[120px] w-[120px]" />
          <Logo size={24} />
        </div>
        {children}
      </div>
    </main>
  );
}
