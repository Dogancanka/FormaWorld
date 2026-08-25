export interface ApsResource<TAttributes> {
  type: string;
  id: string;
  attributes: TAttributes;
}

export interface ApsHubAttributes {
  name?: string;
  displayName?: string;
  extension?: { type?: string };
}

export interface ApsProjectAttributes {
  name?: string;
  displayName?: string;
  extension?: { type?: string };
}

export interface ApsCollection<T> {
  data: T[];
  links?: { next?: { href?: string } | string };
}

export type ApsHub = ApsResource<ApsHubAttributes>;
export type ApsProject = ApsResource<ApsProjectAttributes>;

export interface HubSummary {
  id: string;
  name: string;
  kind?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  kind?: string;
}
