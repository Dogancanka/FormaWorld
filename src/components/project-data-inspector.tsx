"use client";

import { useCallback, useState } from "react";
import type {
  DataSourceId,
  DataSourceResult,
  DataSourceState,
  InspectorResults,
} from "@/lib/aps/inspector-types";

const sources: Array<{ id: DataSourceId; label: string; icon: string }> = [
  { id: "documents", label: "Documents", icon: "D" },
  { id: "issues", label: "Issues", icon: "!" },
  { id: "assets", label: "Assets", icon: "A" },
  { id: "forms", label: "Forms", icon: "F" },
  { id: "people", label: "People", icon: "P" },
];

const stateLabels: Record<DataSourceState, string> = {
  loading: "Loading",
  available: "Available",
  empty: "Empty",
  permission_denied: "No access",
  unsupported: "Not available",
  error: "Error",
};

interface InspectorPayload {
  results?: InspectorResults;
  error?: string;
}

async function fetchInspector(): Promise<InspectorResults> {
  const response = await fetch("/api/project-data", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as InspectorPayload;
  if (!response.ok || !payload.results) {
    throw new Error(payload.error ?? "Project data could not be loaded.");
  }
  return payload.results;
}

export function ProjectDataInspector() {
  const [results, setResults] = useState<InspectorResults>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState<DataSourceId>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setResults(await fetchInspector());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // The probe is a read-only diagnostic, so it costs an APS round trip per
  // source. It runs on the first open instead of on every project page load.
  const onToggle = useCallback(
    (event: React.SyntheticEvent<HTMLDetailsElement>) => {
      if (event.currentTarget.open && !results && !loading) void load();
    },
    [load, loading, results],
  );

  return (
    <details className="inspector" onToggle={onToggle}>
      <summary>
        <strong>Project data check</strong>
        <span>A limited, read-only probe of the selected Autodesk project</span>
      </summary>

      <div className="inspector-heading">
        <p>Documents, Issues, Assets, Forms and People, straight from APS.</p>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh data"}
        </button>
      </div>

      {error && (
        <div className="notice error" role="alert">
          <strong>The project probe failed</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="data-grid">
        {sources.map((source) => {
          const sourceResult = results?.[source.id];
          const state: DataSourceState = loading && !sourceResult ? "loading" : sourceResult?.state ?? "loading";
          return (
            <DataCard
              key={source.id}
              icon={source.icon}
              label={source.label}
              state={state}
              result={sourceResult}
              expanded={expanded === source.id}
              onToggle={() => setExpanded((current) => current === source.id ? undefined : source.id)}
            />
          );
        })}
      </div>
      <p className="inspector-footnote">Previews are capped at 10 records. No project data is stored locally.</p>
    </details>
  );
}

function DataCard({
  icon,
  label,
  state,
  result,
  expanded,
  onToggle,
}: {
  icon: string;
  label: string;
  state: DataSourceState;
  result?: DataSourceResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canExpand = Boolean(result?.items.length);
  return (
    <article className={`data-card state-${state}`}>
      <div className="data-card-top">
        <span className="data-icon" aria-hidden="true">{icon}</span>
        <span className="state-pill"><i /> {stateLabels[state]}</span>
      </div>
      <h3>{label}</h3>
      {state === "loading" ? (
        <div className="loading-lines" aria-label="Loading data"><span /><span /></div>
      ) : (
        <>
          <strong className="data-count">{result?.count ?? 0}</strong>
          <p>{result?.summary ?? "No response received."}</p>
          {result?.httpStatus && <small>HTTP {result.httpStatus}</small>}
          {result?.error && <details className="api-error"><summary>Show APS error</summary><code>{result.error}</code></details>}
          {canExpand && (
            <button className="inspect-button" type="button" onClick={onToggle}>
              {expanded ? "Hide preview" : "Show preview"}
            </button>
          )}
        </>
      )}
      {expanded && result && (
        <div className="preview-list">
          {result.items.map((item) => (
            <div className="preview-item" key={item.id}>
              <strong>{item.title}</strong>
              {item.details.map((detail) => (
                <span key={`${detail.label}-${detail.value}`}><b>{detail.label}</b> {detail.value}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
