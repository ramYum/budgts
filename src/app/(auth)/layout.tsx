import { BrandStage } from "./brand-stage";

/** The brand's one big moment: the living pixel robin, the Dogica wordmark
 * and a savings line, centered on the plain canvas above the sign-in card. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="page-enter mb-8">
          <BrandStage />
        </div>
        <div className="reveal card rounded-3xl border border-hairline p-6" style={{ ["--i" as string]: 2 }}>
          {children}
        </div>
      </div>
    </main>
  );
}
