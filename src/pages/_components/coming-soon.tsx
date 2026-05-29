export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex h-[calc(100vh-100px)] items-center justify-center">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">This feature is coming soon to the platform.</p>
      </div>
    </div>
  );
}
