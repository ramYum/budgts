export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 p-6">
      <div className="flex items-center gap-2">
        <span className="inline-block h-6 w-6 rounded-md bg-foreground" aria-hidden />
        <span className="text-lg font-semibold">Budgts</span>
      </div>
      {children}
    </main>
  );
}
