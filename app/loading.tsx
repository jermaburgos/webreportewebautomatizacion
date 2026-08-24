export default function Loading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#020617_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/6 p-8 backdrop-blur">
          <div className="h-4 w-40 animate-pulse rounded-full bg-white/10" />
          <div className="mt-6 h-12 w-3/4 animate-pulse rounded-3xl bg-white/10" />
          <div className="mt-4 h-5 w-2/3 animate-pulse rounded-full bg-white/10" />
          <div className="mt-8 flex gap-3">
            <div className="h-10 w-28 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-10 w-28 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-10 w-28 animate-pulse rounded-2xl bg-white/10" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-3xl border border-white/10 bg-white/6" />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="h-[32rem] animate-pulse rounded-[2rem] border border-white/10 bg-white/6" />
          <div className="space-y-6">
            <div className="h-60 animate-pulse rounded-[2rem] border border-white/10 bg-white/6" />
            <div className="h-72 animate-pulse rounded-[2rem] border border-white/10 bg-white/6" />
          </div>
        </div>
      </div>
    </main>
  );
}
