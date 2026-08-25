import { redirect } from "next/navigation";
import Link from "next/link";
import { ProjectDataInspector } from "@/components/project-data-inspector";
import { WorldHorizon } from "@/components/world-horizon";
import { getSession, worldProjects } from "@/lib/session";

export default async function ProjectPage() {
  const session = await getSession();
  if (!session.accessToken) redirect("/");
  const projects = worldProjects(session);
  if (projects.length === 0) redirect("/projects");
  const project = projects[0];

  return (
    <main className="shell project-home">
      <section className="project-card">
        <p className="connection-status"><span /> Connected to Autodesk</p>
        <h1>{projects.length > 1 ? `${projects.length} projects` : project.name}</h1>
        <p className="project-hub">{project.hubName}</p>
        {projects.length > 1 && (
          <ul className="project-set">
            {projects.map((entry) => <li key={entry.id}>{entry.name}</li>)}
          </ul>
        )}
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
          {projects.map((entry) => (
            <div key={entry.id}><dt>{entry.name}</dt><dd>{entry.id}</dd></div>
          ))}
          <div><dt>Hub ID</dt><dd>{project.hubId}</dd></div>
        </dl>
      </details>
      <ProjectDataInspector />
      <p className="phase-note">
        The world is a visual project metaphor; object placement is not GPS or model data.
        {projects.length > 1 && " Each project is its own walled compound on the same ground."}
      </p>
      <WorldHorizon />
    </main>
  );
}
