import Link from "next/link";
import { WorldHorizon } from "@/components/world-horizon";
import { getSession } from "@/lib/session";

const worldContents = ["Assets", "Issues", "Documents", "Forms", "People"];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ authError?: string }>;
}) {
  const session = await getSession();
  const { authError } = await searchParams;
  const authenticated = Boolean(session.accessToken && session.expiresAt);

  return (
    <main className="shell landing">
      <section className="hero">
        <p className="eyebrow">Autodesk Forma, made spatial</p>
        <h1>Your project.<br />As a place you can enter.</h1>
        <p className="lede">
          Connect your Autodesk account, pick a project, and see its live records
          as one world you can walk through.
        </p>
        {authError && (
          <div className="notice error compact" role="alert">
            <strong>Autodesk sign-in failed</strong>
            <p>{authError}</p>
          </div>
        )}
        {authenticated ? (
          <Link className="button primary" href={session.selectedProject ? "/project" : "/projects"}>
            Continue to {session.selectedProject ? "your project" : "project selection"}
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <a className="button primary" href="/api/auth/login">
            Connect Autodesk <span aria-hidden="true">→</span>
          </a>
        )}
        <ul className="hero-contents">
          {worldContents.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>
        <p className="security-note">Server-side sign-in · No Autodesk keys in the browser</p>
      </section>
      <WorldHorizon />
    </main>
  );
}
