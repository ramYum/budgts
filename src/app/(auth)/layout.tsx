import { Robin } from "@/components/mascot";

/** The brand's one big moment: the pixel robin and the Dogica wordmark, set
 * on the plain canvas with Swiss restraint (left-aligned, lots of air). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="page-enter mb-10">
          <Robin size={88} mood="happy" title="Budgts robin" />
          <p className="font-pixel-bold mt-6 text-[32px] leading-none text-ink">Budgts</p>
          <p className="font-pixel mt-4 text-[8px] uppercase text-muted">
            Track <span className="text-accent">:</span> Plan <span className="text-accent">:</span> Grow
          </p>
          <div className="mt-6 h-px w-10 bg-accent" aria-hidden />
        </div>
        <div className="reveal card rounded-3xl border border-hairline p-6" style={{ ["--i" as string]: 2 }}>
          {children}
        </div>
      </div>
    </main>
  );
}
