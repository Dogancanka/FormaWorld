export type IssueVisualState = "open" | "answered" | "closed" | "overdue" | "unknown";

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

export function issueVisualState(status: unknown, dueDate: unknown, now = new Date()): IssueVisualState {
  const normalizedStatus = normalized(status);
  if (["closed", "resolved", "completed", "void"].includes(normalizedStatus)) return "closed";

  if (typeof dueDate === "string" && dueDate.trim()) {
    const deadline = new Date(dueDate);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < now.getTime()) return "overdue";
  }

  if (["answered", "response_provided"].includes(normalizedStatus)) return "answered";
  if (["open", "draft", "in_review", "pending"].includes(normalizedStatus)) return "open";
  return "unknown";
}

// Site-signal colours: an issue is shown as a traffic cone in the world, so the
// palette follows what a cone colour means on a real site rather than a chart
// palette. Red is open work, deeper red is overdue, yellow is waiting on a
// response, green is finished, grey is a status the world does not interpret.
export function issueStateColor(state: IssueVisualState): string {
  switch (state) {
    case "closed": return "#3faa5f";
    case "answered": return "#e8b32c";
    case "overdue": return "#a8221a";
    case "open": return "#e03a24";
    default: return "#8d9499";
  }
}
