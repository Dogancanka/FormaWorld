import { redirect } from "next/navigation";
import Link from "next/link";
import { ProjectDataInspector } from "@/components/project-data-inspector";
import { WorldHorizon } from "@/components/world-horizon";
import { getSession } from "@/lib/session";

export default async function ProjectPage() {
  const session = await getSession();
  if (!session.accessToken) redirect("/");
  if (!session.selectedProject) redirect("/projects");
  const project = session.selectedProject;

  return (
    <main className="shell project-home">
      <section className="project-card">
        <p className="connection-status"><span /> Connected to Autodesk</p>
        <h1>{project.name}</h1>
        <p className="project-hub">{project.hubName}</p>
        <div className="actions">
          <Link className="button primary" href="/world">
            Enter the world <span aria-hidden="true">→</span>
          </Link>
          <form action="/api/projects/change" method="post">
            <button className="button secondary" type="submit">Switch project</button>
          </form>
          <form action="/api/auth/logout" method="post">
            <button className="text-button" type="submit">Sign out</button>
          </form>
        </div>
      </section>
      <details className="project-technical">
        <summary>Technical project details</summary>
        <dl>
          <div><dt>Project ID</dt><dd>{project.id}</dd></div>
          <div><dt>Hub ID</dt><dd>{project.hubId}</dd></div>
        </dl>
      </details>
      <ProjectDataInspector />
      <p className="phase-note">
        The world is a visual project metaphor; object placement is not GPS or model data.
      </p>
      <WorldHorizon />
    </main>
  );
}
