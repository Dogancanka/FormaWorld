import { redirect } from "next/navigation";
import { WorldExperience } from "@/components/world/world-experience";
import { getSession, worldProjects } from "@/lib/session";

export default async function WorldPage() {
  const session = await getSession();
  if (!session.accessToken) redirect("/");
  const projects = worldProjects(session);
  if (projects.length === 0) redirect("/projects");

  return (
    <main className="world-page">
      <WorldExperience
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          hubName: project.hubName,
        }))}
      />
    </main>
  );
}
