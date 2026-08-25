export interface PeopleGridLayout {
  columns: number;
  rows: number;
  offsets: Array<[number, number]>;
}

export function layoutPeople(count: number, size: [number, number]): PeopleGridLayout {
  const spacing = count <= 24 ? 0.82 : count <= 60 ? 0.58 : 0.42;
  const columns = Math.min(
    Math.max(1, Math.floor(Math.max(1, size[0] - 1.2) / spacing)),
    Math.max(1, Math.ceil(Math.sqrt(count * 1.35))),
  );
  const rows = Math.max(1, Math.ceil(count / columns));
  // District structures stand at the back of a district, so the crew lane runs
  // across the front half where nothing can hide a project member.
  const backBoundary = 0;
  const frontBoundary = size[1] / 2 - 0.65;
  const rowSpacing = rows === 1
    ? 0
    : Math.min(spacing, (frontBoundary - backBoundary) / (rows - 1));
  const occupiedDepth = (rows - 1) * rowSpacing;
  const startZ = (frontBoundary + backBoundary - occupiedDepth) / 2;
  const offsets = Array.from({ length: count }, (_, index): [number, number] => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return [
      (column - (columns - 1) / 2) * spacing,
      startZ + row * rowSpacing,
    ];
  });
  return { columns, rows, offsets };
}
