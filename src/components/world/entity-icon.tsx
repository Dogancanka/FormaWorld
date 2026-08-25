"use client";

import { assetAppearance, type AssetAppearance, type AssetCategoryOption, type AssetForm } from "@/world/assets/materials";
import type { WorldEntity } from "@/world/entities";
import { personAppearance, type PersonAppearance } from "@/world/people/identity";
import { issueStateColor, type IssueVisualState } from "@/world/rules/issue-state";

/**
 * The list icons are drawn from the same data as the 3D objects, so a row in the
 * district panel looks like the thing standing in the world: an asset shows its
 * material form and category colour, an issue shows a traffic cone in its APS
 * state colour, and a project member shows their own vest and helmet. A generic
 * lettered badge told the reader nothing and broke the link between the panel
 * and the ground.
 */

function assetLookOf(entity: WorldEntity, categories: AssetCategoryOption[]): AssetAppearance {
  const categoryId = typeof entity.metadata.categoryId === "string" ? entity.metadata.categoryId : undefined;
  const categoryText = typeof entity.metadata.categoryText === "string"
    ? entity.metadata.categoryText
    : typeof entity.metadata.categoryName === "string" ? entity.metadata.categoryName : undefined;
  return assetAppearance({ categoryId, categoryText, title: entity.title, externalId: entity.externalId }, categories);
}

function issueStateOf(entity: WorldEntity): IssueVisualState {
  const state = entity.metadata.visualState;
  return typeof state === "string" ? state as IssueVisualState : "unknown";
}

function MaterialGlyph({ form, body, trim }: { form: AssetForm; body: string; trim: string }) {
  switch (form) {
    case "lumber":
      return (
        <>
          <rect x="3" y="14" width="18" height="4" rx="1" fill={body} />
          <rect x="4" y="9.5" width="16" height="4" rx="1" fill={trim} />
          <rect x="5.5" y="5" width="13" height="4" rx="1" fill={body} />
        </>
      );
    case "pipes":
      return (
        <>
          <rect x="2.5" y="17" width="19" height="2.5" rx="1" fill={trim} />
          <circle cx="7" cy="13" r="3.4" fill={body} />
          <circle cx="14" cy="13" r="3.4" fill={body} />
          <circle cx="10.5" cy="7" r="3.4" fill={body} />
          <circle cx="17.5" cy="7" r="3.4" fill={trim} />
        </>
      );
    case "pallet":
      return (
        <>
          <rect x="2.5" y="16.5" width="19" height="3" rx="1" fill={trim} />
          <rect x="4" y="10" width="7" height="6" rx="1" fill={body} />
          <rect x="12.5" y="10" width="7" height="6" rx="1" fill={body} />
          <rect x="8" y="4" width="8" height="5.5" rx="1" fill={trim} />
        </>
      );
    case "drums":
      return (
        <>
          <rect x="3" y="18" width="18" height="2.5" rx="1" fill={trim} />
          <rect x="4" y="7" width="7" height="11" rx="2.4" fill={body} />
          <rect x="13" y="7" width="7" height="11" rx="2.4" fill={body} />
          <rect x="4" y="11" width="7" height="1.6" fill={trim} />
          <rect x="13" y="11" width="7" height="1.6" fill={trim} />
        </>
      );
    case "panels":
      return (
        <>
          <rect x="2.5" y="18" width="19" height="2.5" rx="1" fill={trim} />
          <rect x="5" y="4" width="4" height="14" rx="1" transform="rotate(-9 7 11)" fill={body} />
          <rect x="10" y="4" width="4" height="14" rx="1" fill={trim} />
          <rect x="15" y="4" width="4" height="14" rx="1" transform="rotate(9 17 11)" fill={body} />
        </>
      );
    case "fittings":
      return (
        <>
          <rect x="3.5" y="11" width="17" height="9" rx="1.5" fill={trim} />
          <rect x="5.5" y="9.5" width="13" height="2" rx="1" fill={body} />
          <circle cx="9" cy="6" r="3" fill="none" stroke={body} strokeWidth="1.8" />
          <circle cx="15.5" cy="6.5" r="2.4" fill="none" stroke={body} strokeWidth="1.6" />
        </>
      );
  }
}

export function AssetIcon({ entity, categories }: { entity: WorldEntity; categories: AssetCategoryOption[] }) {
  const look = assetLookOf(entity, categories);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <MaterialGlyph form={look.form} body={look.color} trim={look.accent} />
    </svg>
  );
}

/** A traffic cone in the issue's authoritative APS state colour. */
export function IssueIcon({ entity }: { entity: WorldEntity }) {
  const color = issueStateColor(issueStateOf(entity));
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="18.5" width="18" height="3" rx="1" fill="#2e3438" />
      <path d="M12 3 L17.5 18.5 H6.5 Z" fill={color} />
      <path d="M10.2 9 H13.8 L14.5 11.6 H9.5 Z" fill="#f4f6f5" />
      <path d="M9.1 13 H14.9 L15.7 15.6 H8.3 Z" fill="#f4f6f5" />
    </svg>
  );
}

/**
 * A project member's own kit: helmet, skin and hi-vis vest come from
 * `personAppearance`, the same function the NPC in the world is built from, so
 * the row reads as a portrait of that specific person.
 */
export function PersonIcon({ entity }: { entity: WorldEntity }) {
  const look: PersonAppearance = personAppearance(entity);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {/* Shoulders and sleeves */}
      <path d="M3.5 22 V17.5 C3.5 15 6 13.6 12 13.6 C18 13.6 20.5 15 20.5 17.5 V22 Z" fill={look.sleeves} />
      {/* Hi-vis vest over the torso */}
      <path d="M7.6 22 V15.2 C9 14.4 15 14.4 16.4 15.2 V22 Z" fill={look.vest} />
      <rect x="7.6" y="16.6" width="8.8" height="1.5" fill="#eef2f4" />
      <rect x="7.6" y="19.4" width="8.8" height="1.5" fill="#eef2f4" />
      {/* Head */}
      <rect x="8.7" y="6.6" width="6.6" height="7.2" rx="1.6" fill={look.skin} />
      {/* Hard hat with its brim */}
      <path d="M7.2 6.8 C7.2 3.9 9.3 2.4 12 2.4 C14.7 2.4 16.8 3.9 16.8 6.8 Z" fill={look.helmet} />
      <rect x="5.9" y="6.4" width="12.2" height="1.7" rx="0.85" fill={look.helmet} />
      <rect x="11.4" y="2.6" width="1.2" height="4" fill="#ffffff" opacity="0.35" />
    </svg>
  );
}

/** An archive folder or a standing drawing set, as in the Documents district. */
export function DocumentIcon({ entity }: { entity: WorldEntity }) {
  const isFolder = entity.metadata.isFolder === true;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {isFolder ? (
        <>
          <path d="M3 6.5 H9.5 L11 8.6 H21 V19.5 H3 Z" fill="#c9973f" />
          <rect x="3" y="10.6" width="18" height="8.9" fill="#e0ba66" />
          <rect x="7.5" y="8.4" width="9" height="3.4" fill="#fbf6ea" />
        </>
      ) : (
        <>
          <rect x="5.5" y="3.5" width="13" height="17" rx="1.4" fill="#f2f4ee" />
          <rect x="5.5" y="3.5" width="2.6" height="17" rx="1.2" fill="#3f8fd4" />
          <rect x="10" y="7" width="6.6" height="1.6" fill="#9db1bc" />
          <rect x="10" y="11" width="6.6" height="1.6" fill="#9db1bc" />
          <rect x="10" y="15" width="4.4" height="1.6" fill="#c8d6dd" />
        </>
      )}
    </svg>
  );
}

/** The inspection totem's clipboard. */
export function FormIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.6" fill="#f4f3ed" />
      <rect x="8.5" y="1.8" width="7" height="3.2" rx="1.2" fill="#8f9aa2" />
      <rect x="7" y="7.5" width="10" height="2.4" fill={color} />
      <rect x="7" y="12" width="10" height="1.6" fill="#8ca098" />
      <rect x="7" y="15.4" width="6.6" height="1.6" fill="#8ca098" />
    </svg>
  );
}

/** The RFI notice board on its two posts. */
export function RfiIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="15" width="1.7" height="6.5" fill="#93a6b2" />
      <rect x="15.3" y="15" width="1.7" height="6.5" fill="#93a6b2" />
      <rect x="3.5" y="4" width="17" height="12" rx="1.4" fill="#f0f3f2" />
      <rect x="3.5" y="4" width="17" height="3.4" rx="1.4" fill={color} />
      <rect x="6.2" y="9.6" width="11.6" height="1.6" fill="#9aa8ae" />
      <rect x="6.2" y="12.6" width="7.6" height="1.6" fill="#9aa8ae" />
    </svg>
  );
}

/**
 * The icon for one record, matching how that record is drawn in the world.
 * `rfiStatusColor` and `formStatusColor` live in the canvas, so they are passed
 * in rather than duplicated here.
 */
export function EntityIcon({
  entity,
  assetCategories,
  rfiColor,
  formColor,
}: {
  entity: WorldEntity;
  assetCategories: AssetCategoryOption[];
  rfiColor: (status: string | undefined) => string;
  formColor: (status: string | undefined) => string;
}) {
  switch (entity.type) {
    case "asset": return <AssetIcon entity={entity} categories={assetCategories} />;
    case "issue": return <IssueIcon entity={entity} />;
    case "person": return <PersonIcon entity={entity} />;
    case "document": return <DocumentIcon entity={entity} />;
    case "form": return <FormIcon color={formColor(entity.status)} />;
    case "rfi": return <RfiIcon color={rfiColor(entity.status)} />;
  }
}
