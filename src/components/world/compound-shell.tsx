"use client";

import { useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import { Shape } from "three";
import {
  compoundCorners,
  gateMouth,
  wallRunIsAlongX,
  wallRuns,
  TOWER_SIZE,
  WALL_HEIGHT,
  WALL_THICKNESS,
  type CompoundBounds,
  type CompoundGate,
  type GroundPath,
  type WallRun,
} from "@/world/compound";
import { WATER_BANK_WIDTH, waterBankOutline, waterOutline, type WaterBody } from "@/world/water";
import { brickTexture, dirtTexture, grassTexture } from "@/world/visual/textures";

// The physical shell of the world: one continuous warm ground plane, a blocky
// sandstone wall resting directly on it, and flat dirt paths between the
// districts. Nothing here represents an APS record — it is the terrain the real
// project entities live in.

// The terrain has to run well past the point the fog turns it to solid haze, or
// the world reads as a square tile floating in the sky. At the widest zoom the
// camera reaches roughly 120 units from the centre, so the plane is sized far
// beyond that and the fog closes the horizon before the edge is ever in view.
const GROUND_SIZE = 900;
/** Paths sit a hair above the ground; each gets its own micro-layer so two
 *  overlapping rectangles never z-fight at their shared corner. */
const PATH_Y = 0.02;
const PATH_LAYER_STEP = 0.0006;
const MERLON_SPACING = 0.66;
const MERLON_WIDTH = 0.34;
const MERLON_HEIGHT = 0.28;
const CAP_HEIGHT = 0.14;
const CAP_Y = WALL_HEIGHT + CAP_HEIGHT / 2;
const MERLON_Y = WALL_HEIGHT + CAP_HEIGHT + MERLON_HEIGHT / 2;
const TOWER_HEIGHT = WALL_HEIGHT + 1.05;

const SANDSTONE = "#d9c096";
const SANDSTONE_MORTAR = "#ecdcbc";
const SANDSTONE_CAP = "#c6a87c";
const SANDSTONE_TRIM = "#3a63a6";
const GRASS = "#8ab45f";
const DIRT = "#a97d4e";

function tiles(length: number, per: number): number {
  return Math.max(1, Math.round(length / per));
}

/**
 * The terrain, sized to the world standing on it.
 *
 * It used to be a fixed 900-unit tile whatever the world contained, which put
 * its edge hundreds of units past anything the scenery covered — so a river ran
 * out mid-field and the wood stopped against bare grass. The plane now follows
 * the compounds, and the scenery is planted to the same extent, so the ground
 * ends only where the fog has already closed it.
 */
export function GroundPlane({ size = GROUND_SIZE }: { size?: number }) {
  const grass = useMemo(() => grassTexture(GRASS, [size / 3.2, size / 3.2]), [size]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={grass} roughness={1} />
    </mesh>
  );
}

export function DirtPaths({ paths }: { paths: GroundPath[] }) {
  return <>{paths.map((path, index) => (
    <PathTile key={path.id} path={path} layer={index} />
  ))}</>;
}

function PathTile({ path, layer }: { path: GroundPath; layer: number }) {
  const map = useMemo(
    () => dirtTexture(DIRT, [tiles(path.size[0], 2.2), tiles(path.size[1], 2.2)]),
    [path.size],
  );
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[path.center[0], PATH_Y + layer * PATH_LAYER_STEP, path.center[1]]}
      receiveShadow
    >
      <planeGeometry args={[path.size[0], path.size[1]]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  );
}

export function CompoundWall({ bounds, gates }: { bounds: CompoundBounds; gates: CompoundGate[] }) {
  const runs = useMemo(() => wallRuns(bounds, gates), [bounds, gates]);
  const corners = useMemo(() => compoundCorners(bounds), [bounds]);
  const merlons = useMemo(() => merlonLayout(runs, corners), [runs, corners]);
  return (
    <group>
      {runs.map((run) => <WallSection key={run.id} run={run} />)}
      {corners.map(([x, z]) => <CornerTower key={`${x}:${z}`} position={[x, z]} />)}
      {gates.map((gate) => <Gatehouse key={gate.id} gate={gate} bounds={bounds} />)}
      {merlons.length > 0 && (
        <Instances limit={merlons.length} castShadow receiveShadow>
          <boxGeometry args={[MERLON_WIDTH, MERLON_HEIGHT, WALL_THICKNESS + 0.06]} />
          <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.95} />
          {merlons.map((merlon) => (
            <Instance key={merlon.id} position={merlon.position} rotation={merlon.rotation} />
          ))}
        </Instances>
      )}
    </group>
  );
}

function WallSection({ run }: { run: WallRun }) {
  const alongX = wallRunIsAlongX(run);
  const map = useMemo(
    () => brickTexture(SANDSTONE, SANDSTONE_MORTAR, [tiles(run.length, 2.4), 1]),
    [run.length],
  );
  const size: [number, number, number] = alongX
    ? [run.length, WALL_HEIGHT, WALL_THICKNESS]
    : [WALL_THICKNESS, WALL_HEIGHT, run.length];
  const footing: [number, number, number] = alongX
    ? [run.length, 0.2, WALL_THICKNESS + 0.26]
    : [WALL_THICKNESS + 0.26, 0.2, run.length];
  const cap: [number, number, number] = alongX
    ? [run.length, CAP_HEIGHT, WALL_THICKNESS + 0.14]
    : [WALL_THICKNESS + 0.14, CAP_HEIGHT, run.length];
  return (
    <group position={[run.center[0], 0, run.center[1]]}>
      <mesh receiveShadow castShadow position={[0, 0.1, 0]}>
        <boxGeometry args={footing} />
        <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.96} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial map={map} roughness={0.94} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, CAP_Y, 0]}>
        <boxGeometry args={cap} />
        <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.95} />
      </mesh>
    </group>
  );
}

function CornerTower({ position }: { position: [number, number] }) {
  const map = useMemo(() => brickTexture(SANDSTONE, SANDSTONE_MORTAR, [2, 2]), []);
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh receiveShadow castShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[TOWER_SIZE + 0.3, 0.24, TOWER_SIZE + 0.3]} />
        <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.96} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, TOWER_HEIGHT / 2, 0]}>
        <boxGeometry args={[TOWER_SIZE, TOWER_HEIGHT, TOWER_SIZE]} />
        <meshStandardMaterial map={map} roughness={0.94} />
      </mesh>
      <mesh position={[0, TOWER_HEIGHT - 0.2, 0]}>
        <boxGeometry args={[TOWER_SIZE + 0.06, 0.09, TOWER_SIZE + 0.06]} />
        <meshStandardMaterial color={SANDSTONE_TRIM} roughness={0.6} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, TOWER_HEIGHT + CAP_HEIGHT / 2, 0]}>
        <boxGeometry args={[TOWER_SIZE + 0.22, CAP_HEIGHT, TOWER_SIZE + 0.22]} />
        <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.95} />
      </mesh>
      <TowerCrenellation top={TOWER_HEIGHT + CAP_HEIGHT} size={TOWER_SIZE + 0.22} />
    </group>
  );
}

function TowerCrenellation({ top, size }: { top: number; size: number }) {
  const merlons = useMemo(() => {
    const half = size / 2 - MERLON_WIDTH / 2;
    const count = Math.max(2, Math.floor(size / MERLON_SPACING));
    const step = (half * 2) / (count - 1);
    const spots: { key: string; position: [number, number, number] }[] = [];
    for (let index = 0; index < count; index += 1) {
      const offset = -half + index * step;
      spots.push({ key: `n${index}`, position: [offset, 0, -half] });
      spots.push({ key: `s${index}`, position: [offset, 0, half] });
      if (index > 0 && index < count - 1) {
        spots.push({ key: `w${index}`, position: [-half, 0, offset] });
        spots.push({ key: `e${index}`, position: [half, 0, offset] });
      }
    }
    return spots;
  }, [size]);
  return (
    <group position={[0, top + MERLON_HEIGHT / 2, 0]}>
      {merlons.map((merlon) => (
        <mesh key={merlon.key} castShadow position={merlon.position}>
          <boxGeometry args={[MERLON_WIDTH, MERLON_HEIGHT, MERLON_WIDTH]} />
          <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function Gatehouse({ gate, bounds }: { gate: CompoundGate; bounds: CompoundBounds }) {
  const [x, z] = gateMouth(gate, bounds);
  const alongX = gate.side === "north" || gate.side === "south";
  const rotation: [number, number, number] = alongX ? [0, 0, 0] : [0, Math.PI / 2, 0];
  const towerOffset = gate.width / 2 + TOWER_SIZE / 2 - 0.1;
  const gateTowerHeight = WALL_HEIGHT + 1.45;
  const map = useMemo(() => brickTexture(SANDSTONE, SANDSTONE_MORTAR, [2, 3]), []);
  return (
    <group position={[x, 0, z]} rotation={rotation}>
      {[-towerOffset, towerOffset].map((offset) => (
        <group key={offset} position={[offset, 0, 0]}>
          <mesh receiveShadow castShadow position={[0, 0.12, 0]}>
            <boxGeometry args={[TOWER_SIZE + 0.24, 0.24, TOWER_SIZE + 0.24]} />
            <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.96} />
          </mesh>
          <mesh receiveShadow castShadow position={[0, gateTowerHeight / 2, 0]}>
            <boxGeometry args={[TOWER_SIZE * 0.92, gateTowerHeight, TOWER_SIZE * 0.92]} />
            <meshStandardMaterial map={map} roughness={0.94} />
          </mesh>
          <mesh position={[0, gateTowerHeight - 0.24, 0]}>
            <boxGeometry args={[TOWER_SIZE * 0.98, 0.1, TOWER_SIZE * 0.98]} />
            <meshStandardMaterial color={SANDSTONE_TRIM} roughness={0.6} />
          </mesh>
          <mesh receiveShadow castShadow position={[0, gateTowerHeight + CAP_HEIGHT / 2, 0]}>
            <boxGeometry args={[TOWER_SIZE + 0.16, CAP_HEIGHT, TOWER_SIZE + 0.16]} />
            <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.95} />
          </mesh>
          <TowerCrenellation top={gateTowerHeight + CAP_HEIGHT} size={TOWER_SIZE + 0.16} />
        </group>
      ))}
      {/* Lintel over the opening so the gate reads as a way in, not a gap. */}
      <mesh receiveShadow castShadow position={[0, WALL_HEIGHT - 0.18, 0]}>
        <boxGeometry args={[gate.width + 0.5, 0.42, WALL_THICKNESS + 0.16]} />
        <meshStandardMaterial map={map} roughness={0.94} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT + 0.08, 0]}>
        <boxGeometry args={[gate.width + 0.6, 0.09, WALL_THICKNESS + 0.24]} />
        <meshStandardMaterial color={SANDSTONE_TRIM} roughness={0.6} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, WALL_HEIGHT + 0.22, 0]}>
        <boxGeometry args={[gate.width + 0.66, 0.16, WALL_THICKNESS + 0.3]} />
        <meshStandardMaterial color={SANDSTONE_CAP} roughness={0.95} />
      </mesh>
    </group>
  );
}

interface MerlonSpot {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

/** Battlements along every wall run, skipped where a corner tower already stands. */
function merlonLayout(runs: WallRun[], corners: [number, number][]): MerlonSpot[] {
  const spots: MerlonSpot[] = [];
  const nearCorner = (x: number, z: number) => corners.some(([cornerX, cornerZ]) =>
    Math.abs(x - cornerX) < TOWER_SIZE / 2 + MERLON_WIDTH && Math.abs(z - cornerZ) < TOWER_SIZE / 2 + MERLON_WIDTH);

  for (const run of runs) {
    const alongX = wallRunIsAlongX(run);
    const count = Math.floor(run.length / MERLON_SPACING);
    if (count < 1) continue;
    const step = run.length / count;
    for (let index = 0; index < count; index += 1) {
      const offset = -run.length / 2 + step / 2 + index * step;
      const x = alongX ? run.center[0] + offset : run.center[0];
      const z = alongX ? run.center[1] : run.center[1] + offset;
      if (nearCorner(x, z)) continue;
      spots.push({
        id: `${run.id}-${index}`,
        position: [x, MERLON_Y, z],
        rotation: alongX ? [0, 0, 0] : [0, Math.PI / 2, 0],
      });
    }
  }
  return spots;
}

/**
 * Ponds inside the walls and open water in the meadow. Purely scenery: it sits
 * flush with the terrain, takes no part in picking, and is placed and shaped by
 * `src/world/water.ts` so it can never cover a district, a road or the wall.
 * The surface is deliberately still — a moving ripple drew the eye away from the
 * project data, which is the only thing in this world that should move.
 */
const WATER_Y = 0.012;
const ignoreRaycast = () => null;

export function WaterBodies({ bodies }: { bodies: WaterBody[] }) {
  return <>{bodies.map((body) => <Water key={body.id} body={body} />)}</>;
}

function shapeFrom(points: Array<[number, number]>): Shape {
  const shape = new Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

function Water({ body }: { body: WaterBody }) {
  const water = useMemo(() => shapeFrom(waterOutline(body)), [body]);
  const bank = useMemo(() => shapeFrom(waterBankOutline(body)), [body]);
  const shallows = useMemo(
    () => shapeFrom(waterOutline(body).map(([x, z]) => [x * 0.82, z * 0.82] as [number, number])),
    [body],
  );
  return (
    <group position={[body.center[0], 0, body.center[1]]}>
      {/* Wet bank, so the water reads as a basin rather than a blue decal */}
      <mesh raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y - 0.004, 0]}>
        <shapeGeometry args={[bank]} />
        <meshStandardMaterial color="#b7a882" roughness={1} />
      </mesh>
      <mesh raycast={ignoreRaycast} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]}>
        <shapeGeometry args={[water]} />
        <meshStandardMaterial color={body.inside ? "#4f9ec2" : "#3f8fb8"} roughness={0.28} metalness={0.3} />
      </mesh>
      {/* Lighter shallows where the bank shelves in */}
      <mesh raycast={ignoreRaycast} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y + 0.003, 0]}>
        <shapeGeometry args={[shallows]} />
        <meshStandardMaterial color="#6fbcd8" roughness={0.35} metalness={0.2} />
      </mesh>
      {/* Reeds on the bank give a pond a little height */}
      {body.inside && [0, 1, 2].map((index) => {
        const angle = ((body.seed >>> (index * 3)) % 360) * (Math.PI / 180);
        const reach = body.radius * 0.78 + WATER_BANK_WIDTH;
        return (
          <group key={index} position={[Math.cos(angle) * reach, 0, Math.sin(angle) * reach]}>
            {[-0.05, 0.03, 0.09].map((offset, blade) => (
              <mesh key={blade} raycast={ignoreRaycast} castShadow position={[offset, 0.16, offset * 0.6]} rotation={[0, 0, (blade - 1) * 0.22]}>
                <boxGeometry args={[0.03, 0.34, 0.03]} />
                <meshStandardMaterial color="#5d8a4c" roughness={0.98} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}
