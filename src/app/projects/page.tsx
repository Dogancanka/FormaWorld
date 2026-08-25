import { redirect } from "next/navigation";
import { ProjectPicker } from "@/components/project-picker";
import { WorldHorizon } from "@/components/world-horizon";
import { listHubs } from "@/lib/aps/client";
import type { HubSummary } from "@/lib/aps/types";
import { getSession } from "@/lib/session";

export default async function ProjectsPage() {
  const session = await getSession();
  if (!session.accessToken) redirect("/");

  let hubs: HubSummary[] = [];
  let error: string | undefined;
  try {
    hubs = await listHubs();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not load your Autodesk hubs.";
  }

  return (
    <main className="shell page-stack">
      <div className="page-heading">
        <p className="eyebrow">Project connection</p>
        <h1>Choose your Autodesk hub</h1>
        <p>FormaWorld only shows projects your Autodesk user can access.</p>
      </div>
      {error ? (
        <section className="notice error" role="alert">
          <strong>Autodesk returned an error</strong>
          <p>{error}</p>
          <a className="button secondary" href="/api/auth/login">Sign in again</a>
        </section>
      ) : (
        <ProjectPicker hubs={hubs} />
      )}
      <form action="/api/auth/logout" method="post">
        <button className="text-button" type="submit">Sign out of Autodesk</button>
      </form>
      <WorldHorizon />
    </main>
  );
}
