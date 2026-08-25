"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell page-stack">
      <section className="notice error" role="alert">
        <strong>Something went wrong</strong>
        <p>{error.message}</p>
        <button className="button secondary" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
