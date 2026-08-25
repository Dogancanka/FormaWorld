import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  delete session.selectedProject;
  await session.save();
  return NextResponse.redirect(new URL("/projects", request.url), 303);
}
