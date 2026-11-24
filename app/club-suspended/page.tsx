export default function ClubSuspendedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-primary px-6 text-center">
      <section className="max-w-lg rounded-3xl border border-border bg-card p-8 shadow-xl">
        <h1 className="text-2xl font-black text-primary">Club suspendu</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Ce club est temporairement suspendu. Contactez le propriétaire du club.
        </p>
      </section>
    </main>
  );
}
