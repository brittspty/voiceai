export function NoAccess({ title }: { title: string }) {
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">You don&apos;t have access to this page.</p>
    </div>
  );
}
