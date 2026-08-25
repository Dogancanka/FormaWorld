"use client";

/**
 * The global tool bar. Everything here acts on the whole world rather than on a
 * selected record, which is why it sits at the bottom centre and not inside the
 * inspector: the inspector is about one thing, this is about the site.
 */
export function WorldActionBar({
  onResetView,
  onCreateIssue,
}: {
  onResetView: () => void;
  onCreateIssue: () => void;
}) {
  return (
    <nav className="world-actionbar" aria-label="World tools">
      <button type="button" onClick={onResetView} title="Frame the whole compound again">
        <ResetViewIcon />
        <span>Reset view</span>
      </button>
      <i className="actionbar-divider" aria-hidden="true" />
      <button className="primary" type="button" onClick={onCreateIssue} title="Create a new issue in Autodesk Forma">
        <CreateIssueIcon />
        <span>Create issue</span>
      </button>
    </nav>
  );
}

/** Four corner brackets closing on a centre point: zoom to fit. */
function ResetViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.6 7V3.4A.8.8 0 0 1 3.4 2.6H7M13 2.6h3.6a.8.8 0 0 1 .8.8V7M17.4 13v3.6a.8.8 0 0 1-.8.8H13M7 17.4H3.4a.8.8 0 0 1-.8-.8V13"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="7.6" y="7.6" width="4.8" height="4.8" rx="1.2" fill="currentColor" opacity=".5" />
    </svg>
  );
}

/** A traffic cone with a plus, matching how an issue stands in the world. */
function CreateIssueIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8.2 3.2 11.8 14H4.6Z" fill="currentColor" opacity=".85" />
      <rect x="2.6" y="14.6" width="11.4" height="2.2" rx="1.1" fill="currentColor" />
      <path d="M15.6 4.4v5M13.1 6.9h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
