"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { Plant, PlantKind } from "@/world/scenery/forest";
import { groupByKind } from "@/world/scenery/forest";
import type { RiverCourse } from "@/world/water";

/**
 * The wood and the rivers.
 *
 * Every plant is drawn as one instance of a shared mesh, so a wood of a couple
 * of thousand trees costs about ten draw calls rather than a couple of thousand.
 * That is what makes a dense landscape affordable at all: the previous scatter
 * was a React component per prop, each owning its own geometries and materials,
 * and it could not have gone past a few hundred without the frame budget going
 * with it.
 *
 * None of it takes part in picking. Scenery must never swallow a click meant for
 * a project record, and an instanced mesh would otherwise report a hit for the
 * whole wood at once.
 */

const ignoreRaycast = () => null;

/** Per-species tints, indexed by each plant's own `tint`. */
const PINE_TINTS = ["#3f6b3c", "#4a7a44", "#37623a"];
const BUSH_TINTS = ["#4f7a44", "#5d8a4c", "#456e3d"];
const ROCK_TINTS = ["#9d9484", "#8d8b84", "#a49a88"];

/**
 * One instanced mesh: the same geometry placed once per plant.
 *
 * `offset` is the piece's position within its plant — the second cone of a pine,
 * the smaller stone of a cluster — and is rotated and scaled with the plant so
 * the parts stay together.
 */
function PlantInstances({
  plants,
  tints,
  offset,
  scale = 1,
  children,
}: {
  plants: Plant[];
  tints: string[];
  offset: [number, number, number];
  /** Extra scale on this piece, on top of the plant's own. */
  scale?: number;
  children: React.ReactNode;
}) {
  const mesh = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || plants.length === 0) return;
    const matrix = new Matrix4();
    const local = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scaling = new Vector3();
    const colour = new Color();

    plants.forEach((plant, index) => {
      quaternion.setFromAxisAngle(new Vector3(0, 1, 0), plant.rotation);
      position.set(plant.x, 0, plant.z);
      scaling.setScalar(plant.scale);
      matrix.compose(position, quaternion, scaling);
      // The piece's own offset rides along with the plant's rotation and scale.
      local.makeTranslation(offset[0], offset[1], offset[2]);
      matrix.multiply(local);
      if (scale !== 1) matrix.scale(new Vector3(scale, scale, scale));
      instanced.setMatrixAt(index, matrix);
      colour.set(tints[plant.tint % tints.length]);
      instanced.setColorAt(index, colour);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [offset, plants, scale, tints]);

  if (plants.length === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, plants.length]}
      raycast={ignoreRaycast}
    >
      {children}
    </instancedMesh>
  );
}

export function Forest({ plants }: { plants: Plant[] }) {
  const byKind = useMemo(() => groupByKind(plants), [plants]);
  const pine = byKind.pine;
  const bush = byKind.bush;
  const rock = byKind.rock;

  return (
    <group>
      {/* Nothing in the wood casts a shadow.
          Measured: with the forest in the shadow pass a five-project overview
          ran at 33fps, because the shadow camera covers the whole world and so
          every instance is drawn again into the depth map every frame. The wood
          stands on open grass away from anything its shadow would explain, and
          without it the same view holds 60. The compounds still cast shadows,
          which is where they carry meaning. */}
      <PlantInstances plants={pine} tints={["#6b4d31"]} offset={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.055, 0.075, 0.44, 5]} />
        <meshStandardMaterial roughness={1} />
      </PlantInstances>
      <PlantInstances plants={pine} tints={PINE_TINTS} offset={[0, 0.66, 0]}>
        <coneGeometry args={[0.42, 0.62, 6]} />
        <meshStandardMaterial roughness={0.96} />
      </PlantInstances>
      <PlantInstances plants={pine} tints={PINE_TINTS} offset={[0, 1.0, 0]}>
        <coneGeometry args={[0.31, 0.52, 6]} />
        <meshStandardMaterial roughness={0.96} />
      </PlantInstances>
      <PlantInstances plants={pine} tints={PINE_TINTS} offset={[0, 1.3, 0]}>
        <coneGeometry args={[0.2, 0.42, 5]} />
        <meshStandardMaterial roughness={0.96} />
      </PlantInstances>

      <PlantInstances plants={bush} tints={BUSH_TINTS} offset={[0, 0.17, 0]}>
        <dodecahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial roughness={0.98} />
      </PlantInstances>
      <PlantInstances plants={bush} tints={BUSH_TINTS} offset={[0.19, 0.12, 0.08]} scale={0.68}>
        <dodecahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial roughness={0.98} />
      </PlantInstances>

      <PlantInstances plants={rock} tints={ROCK_TINTS} offset={[0, 0.08, 0.13]}>
        <dodecahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial roughness={1} />
      </PlantInstances>
      <PlantInstances plants={rock} tints={ROCK_TINTS} offset={[0.2, 0.066, 0.1]} scale={0.85}>
        <dodecahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial roughness={1} />
      </PlantInstances>
    </group>
  );
}

/**
 * A river as a ribbon: two vertices per point on the centre line, joined into a
 * strip. Built once from the course, because the course itself never changes
 * unless the compounds move.
 */
function ribbon(points: Array<[number, number]>, halfWidth: number): BufferGeometry {
  const vertices = new Float32Array(points.length * 2 * 3);
  const indices: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const [x, z] = points[index];
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    // The perpendicular to the local direction, which is what gives the channel
    // a constant width through a bend rather than pinching on the inside.
    const dirX = next[0] - previous[0];
    const dirZ = next[1] - previous[1];
    const length = Math.hypot(dirX, dirZ) || 1;
    const normalX = -dirZ / length;
    const normalZ = dirX / length;
    const base = index * 6;
    vertices[base] = x + normalX * halfWidth;
    vertices[base + 1] = 0;
    vertices[base + 2] = z + normalZ * halfWidth;
    vertices[base + 3] = x - normalX * halfWidth;
    vertices[base + 4] = 0;
    vertices[base + 5] = z - normalZ * halfWidth;
    if (index > 0) {
      const a = (index - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function Rivers({ courses }: { courses: RiverCourse[] }) {
  const built = useMemo(() => courses.map((course) => ({
    id: course.id,
    bank: ribbon(course.points, course.halfWidth + 0.42),
    water: ribbon(course.points, course.halfWidth),
    shallows: ribbon(course.points, course.halfWidth * 0.72),
  })), [courses]);

  return <>{built.map((course) => (
    <group key={course.id}>
      {/* Drawn double-sided. The ribbon is a flat strip whose winding depends
          on which way the course happens to run, so a single-sided material
          left whole rivers invisible from above. */}
      <mesh raycast={ignoreRaycast} receiveShadow position={[0, 0.008, 0]} geometry={course.bank}>
        <meshStandardMaterial color="#b7a882" roughness={1} side={DoubleSide} />
      </mesh>
      <mesh raycast={ignoreRaycast} receiveShadow position={[0, 0.012, 0]} geometry={course.water}>
        <meshStandardMaterial color="#3f8fb8" roughness={0.28} metalness={0.3} side={DoubleSide} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[0, 0.015, 0]} geometry={course.shallows}>
        <meshStandardMaterial color="#6fbcd8" roughness={0.35} metalness={0.2} side={DoubleSide} />
      </mesh>
    </group>
  ))}</>;
}

export type { PlantKind };
