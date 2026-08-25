"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";

/**
 * A few puffs rising and fading on a loop. Cheap enough to stand on every
 * overdue marker in the yard: three shared spheres per plume, no textures, and
 * no shadow or raycast participation.
 */
export function SmokePlume({
  tint = "#cfc9be",
  scale = 1,
  speed = .42,
  rise = .82,
  opacity = .4,
}: {
  tint?: string;
  scale?: number;
  speed?: number;
  rise?: number;
  opacity?: number;
}) {
  const puffs = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!puffs.current) return;
    const time = clock.getElapsedTime();
    puffs.current.children.forEach((puff, index) => {
      const progress = ((time * speed + index * .33) % 1);
      puff.position.y = progress * rise;
      puff.position.x = Math.sin(progress * 3 + index) * .1;
      puff.scale.setScalar(.05 + progress * .16);
      const material = (puff as Mesh).material as MeshBasicMaterial;
      material.opacity = (1 - progress) * opacity;
    });
  });
  return (
    <group ref={puffs} scale={scale} raycast={() => null}>
      {[0, 1, 2].map((index) => (
        <mesh key={index} raycast={() => null}>
          <sphereGeometry args={[1, 7, 6]} />
          <meshBasicMaterial color={tint} transparent opacity={opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
