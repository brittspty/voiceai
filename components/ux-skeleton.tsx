function Block({ className }: { className: string }) {
  return <div className={`rounded-xl bg-line ${className}`} />;
}

export function DashboardSkeleton({ showMoney = true }: { showMoney?: boolean }) {
  const cards = showMoney ? 4 : 3;
  return (
    <div aria-busy="true" aria-label="Loading">
      <Block className="mb-4 h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => (
          <Block key={index} className="h-24" />
        ))}
      </div>
      <Block className="mt-4 h-64" />
      <div className="mt-4 grid gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Block key={index} className="h-10" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Block className="mb-4 h-8 w-48" />
      <div className="grid gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Block key={index} className="h-12" />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Block className="mb-4 h-8 w-64" />
      <div className="grid gap-3 md:grid-cols-2">
        <Block className="h-40" />
        <Block className="h-40" />
      </div>
    </div>
  );
}
