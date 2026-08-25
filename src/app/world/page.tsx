import { redirect } from "next/navigation";
import { WorldExperience } from "@/components/world/world-experience";
import { getSession } from "@/lib/session";

export default async function WorldPage() {
  const session = await getSession();
  if (!session.accessToken) redirect("/");
  if (!session.selectedProject) redirect("/projects");

  return (
    <main className="world-page">
      <WorldExperience
        projectName={session.selectedProject.name}
        projectId={session.selectedProject.id}
      />
    </main>
  );
}
