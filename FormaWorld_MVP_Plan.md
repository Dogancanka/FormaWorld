# FormaWorld — MVP Implementation Plan

> Working title: **FormaWorld**
>
> Goal: Build a playable isometric 3D world connected to Autodesk Platform Services (APS) / Autodesk Forma, where real project data is represented as spatial objects, people and activity. Forma remains the source of truth. The world is an alternative interface to the project — not a separate simulation database.

---

## 0. Agent execution rules

This project must be built **phase by phase**.

**Do not implement the whole roadmap in one run.**

For every phase:

1. Inspect the existing repo before changing anything.
2. Implement only the current phase and the minimum foundations it requires.
3. Use official Autodesk APS/Forma documentation for the endpoints being implemented.
4. Do not fake successful APS responses. If access, scopes or permissions fail, show the real error clearly.
5. Run the app, tests and production build before declaring the phase complete.
6. Fix regressions before continuing.
7. At the end of the phase, report:
   - what was implemented;
   - files changed;
   - commands/tests run;
   - what was verified manually;
   - known limitations;
   - exact next phase.
8. **Stop after the phase is complete and wait for approval before continuing.**

Avoid premature abstractions. Prefer a small working vertical slice over a large framework with placeholders.

---

# Product principle

The core loop is:

```text
Autodesk Forma / APS
        │
        ▼
APS Integration Layer
        │
        ▼
Normalized Project State
        │
        ▼
World State
        │
        ▼
Isometric 3D World
        │
        ├── user inspects project data
        └── user performs allowed actions
                    │
                    ▼
              APS write-back
                    │
                    ▼
             Autodesk Forma
```

**Forma is the source of truth.**

The 3D world should never silently invent business state.

Visual movement can be symbolic. For example, an asset with status `Pending` can stand in a warehouse and an asset with status `Ready for delivery` can move to a loading bay. That does **not** mean the world knows the asset's real GPS position unless Forma actually provides that location.

---

# Recommended technical direction

Keep the first version web-based and simple.

### Frontend

- React + TypeScript
- Next.js
- Three.js through React Three Fiber
- Drei for camera/helpers
- Zustand or another lightweight store for world state
- Orthographic camera for the FossFLOW-like isometric look

### Backend

Use server-side Next.js routes initially for:

- APS OAuth
- token/session handling
- APS API proxy calls
- webhook endpoints later

Do **not** expose the APS client secret or refresh token to the browser.

### MVP storage

Do not add a database in Phase 1.

Use a secure server-side session for authentication and keep project/world configuration simple. Add persistent storage only when we have a concrete requirement such as saved world layouts or event history.

---

# Visual direction

Use FossFLOW as **interaction and visual inspiration**, not as a requirement to reuse its rendering engine.

The world should initially have:

- pale/infinite grid;
- orthographic/isometric camera;
- simple shadows;
- clean stylized 3D objects;
- readable labels;
- pan/zoom;
- selectable entities;
- small contextual detail panels;
- minimal UI.

Do not build realistic BIM graphics in the MVP.

The first world should feel closer to:

```text
FossFLOW × management game × live project data
```

than:

```text
APS Viewer with WASD controls
```

---

# Phase 1 — Prove APS authentication and project selection

## Goal

Before building the world, prove that the app can authenticate a real Autodesk user and select a real Forma project.

## Implement

### 1.1 APS configuration

Add environment configuration for the required APS credentials and callback URL.

Example names:

```text
APS_CLIENT_ID
APS_CLIENT_SECRET
APS_CALLBACK_URL
```

Add `.env.example`, but never commit real secrets.

### 1.2 Autodesk sign-in

Implement Autodesk 3-legged OAuth using the Authorization Code flow.

Required user experience:

```text
Landing page
    ↓
Connect Autodesk
    ↓
Autodesk login/consent
    ↓
OAuth callback
    ↓
Authenticated session
```

Tokens must be handled server-side.

### 1.3 Hub/account picker

After login, retrieve the Autodesk hubs/accounts available to the authenticated user.

### 1.4 Project picker

For the selected hub/account, retrieve projects the user can access.

Display at minimum:

- project name;
- project ID;
- hub/account name;
- hub/account ID.

Allow the user to select one project.

### 1.5 Current project context

After selection, show a simple project home screen:

```text
Connected to Autodesk ✓

Project
--------
Name: Example Project
ID: ...
Hub: ...

[Enter Project]
[Change Project]
[Sign out]
```

Do not build the 3D world yet.

## Acceptance gate

Phase 1 is complete only when:

- a real Autodesk login succeeds;
- a real accessible project can be listed;
- a project can be selected;
- its ID/name are available to the app;
- logout works;
- secrets are not exposed client-side;
- refresh/reload does not unexpectedly destroy a valid session;
- production build passes.

**STOP HERE.**

---

# Phase 2 — Prove access to project data before visualizing it

## Goal

Determine what the authenticated user can actually retrieve from the chosen project.

Do this before spending time building representations for unavailable data.

## Build a temporary Project Data Inspector

After a project is selected, show cards for:

```text
Documents
Issues
Assets
Forms
People
```

Each card should have a state such as:

```text
Loading
Available
Empty
Permission denied
Unsupported / unavailable
Error
```

Do not hide `401`, `403`, scope or API errors.

## API capabilities to probe

### Documents

Use APS Data Management to prove that project folders/items can be read.

Start small:

- top-level folders;
- first page of items;
- file/folder metadata.

Do not recursively download the full document tree.

### Issues

Retrieve a small page of issues.

Capture enough data for future visualization:

- ID;
- title;
- status;
- type/subtype if available;
- assigned user;
- due date if available;
- linked/location information if available.

### Assets

Retrieve a small page of assets.

Capture:

- ID;
- name/category;
- status;
- location if available;
- assigned/company information if available;
- relevant custom attributes.

### Forms

Retrieve form templates/forms for the project.

Capture only a small useful subset initially.

### People

Retrieve project users.

Capture:

- user ID / Autodesk ID;
- name;
- email only where API access legitimately provides it;
- role/company/status where available.

## Important rule

Do not assume every project has every module enabled.

The app must handle missing modules gracefully.

## Acceptance gate

Phase 2 is complete when every data source above has a clearly verified result:

- real data;
- empty result;
- permission limitation;
- or documented unsupported state.

Create a short `APS_CAPABILITIES.md` describing what worked in the test project.

**STOP HERE.**

---

# Phase 3 — Build the empty isometric world

## Goal

Now build the world shell, but still without filling it with hundreds of Forma objects.

## World requirements

Create a full-screen isometric world with:

- orthographic camera;
- isometric angle;
- large/infinite-looking grid;
- pan;
- zoom;
- object hover;
- object selection;
- simple shadows;
- clean light background.

Do not add free FPS/WASD navigation yet.

## Create initial semantic zones

Use simple placeholder geometry.

Example:

```text
                    PEOPLE / OFFICE

DOCUMENT ARCHIVE        PROJECT HUB        ISSUE AREA

                ASSET WAREHOUSE
                       │
                  PRODUCTION
                       │
                  LOADING BAY
```

Suggested zones:

- Project Hub;
- Documents;
- Assets / Warehouse;
- Production;
- Loading Bay;
- Issues;
- Forms;
- People.

The layout is a **visual metaphor**, not a claim about physical project geography.

## Project connection

The world must clearly know which selected project it belongs to.

Show project name subtly in the UI.

## Acceptance gate

- authenticate;
- select project;
- enter world;
- pan and zoom smoothly;
- select placeholder objects;
- change project and load the corresponding world context;
- no real project entities are rendered yet;
- production build passes.

**STOP HERE.**

---

# Phase 4 — Create the normalized World Entity model

## Goal

Avoid coupling rendering directly to raw APS responses.

Introduce one small normalized model between Forma and the world.

## Suggested shape

```ts
type WorldEntityType =
  | "asset"
  | "issue"
  | "document"
  | "form"
  | "person";

interface WorldEntity {
  id: string;
  externalId: string;
  type: WorldEntityType;

  title: string;
  status?: string;

  source: "aps";
  projectId: string;

  zone?: string;
  position?: [number, number, number];

  relationships?: Array<{
    type: string;
    targetId: string;
  }>;

  metadata: Record<string, unknown>;
}
```

Keep this model small.

Do not create a complicated ECS/game engine architecture yet.

## Adapter pattern

Create one adapter per source:

```text
APS Asset   → WorldEntity
APS Issue   → WorldEntity
APS File    → WorldEntity
APS Form    → WorldEntity
APS User    → WorldEntity
```

Raw APS payloads should remain available in `metadata` while the MVP evolves.

---

# Phase 5 — First real vertical slice: Assets

## Goal

Prove that real Forma data can physically populate the world.

**Start with one entity type only: Assets.**

## Asset representation

Represent assets initially as simple pallets/crates.

Example:

```text
Asset A-102
Status: Pending
```

becomes:

```text
[ pallet ]
A-102
```

## Status → world zone mapping

Create a small configurable mapping.

Example only:

```ts
{
  pending: "warehouse",
  in_progress: "production",
  ready_for_delivery: "loading-bay",
  delivered: "delivered"
}
```

Do not hard-code assumptions deep inside rendering code.

Unknown statuses go to an `unmapped` / holding area.

## Interaction

Clicking an asset should open a compact panel showing real project data.

Example:

```text
AHU-0042

Status
Ready for delivery

Category
HVAC

Company
Example Ventilation

Issues
2

[Close]
```

Only display values that actually exist.

## Performance rule

Do not render thousands of entities immediately.

Initially cap the rendered list, for example to the first 25–50 entities, and make the limit visible in debug mode.

## Acceptance gate

A real asset from the selected Forma project must:

- be fetched from APS;
- be converted to `WorldEntity`;
- appear as a 3D object;
- appear in the correct mapped zone;
- be selectable;
- show real metadata.

**This is the first major proof of the concept.**

**STOP HERE.**

---

# Phase 6 — Add the remaining Forma entities one by one

Do not implement all entity types in one large change.

Complete and verify each subsection separately.

---

## 6A — Issues

Visual idea:

- warning marker;
- cone;
- beacon;
- floating `!`;
- small problem station.

Represent useful state:

- open;
- answered;
- closed;
- assigned;
- unassigned;
- overdue where derivable.

Click → show issue details.

Do not add write-back yet.

### Gate

A real Forma issue exists visibly in the world and its detail panel reflects APS data.

---

## 6B — Documents

Do **not** render every file in the project.

Start with either:

- top-level folders;
- recent/selected documents;
- a limited document collection.

Visual ideas:

- archive shelves;
- document crates;
- folders;
- terminals.

Click → show:

- name;
- type;
- version information where available;
- modified metadata where available.

### Gate

Real Data Management items can be inspected from the world.

---

## 6C — Forms

Visual ideas:

- clipboard;
- inspection station;
- checkpoint;
- terminal.

Click → show relevant form metadata/status.

### Gate

A real form/form instance can be inspected from the world.

---

## 6D — People

Use project users as stylized NPCs.

Possible display:

```text
Mikkel Sørensen
HVAC Contractor
3 assigned issues
```

Important:

**A project user's position in the game is symbolic.**

Do not imply that the Project Users API provides the person's live physical position.

Use people initially to represent:

- membership;
- company/team;
- responsibility;
- assignment relationships.

### Gate

Real project users are represented as selectable NPCs with correct project metadata.

---

# Phase 7 — Add relationships between entities

## Goal

Make the world feel like a project instead of separate API lists.

Create links in world state when the source data proves a relationship.

Examples:

```text
Person ─ assigned to ─ Issue
Asset ─ related to ─ Issue
Document ─ related to ─ Issue
Form ─ associated with ─ Location/Asset
Person ─ belongs to ─ Company
```

Possible world behavior:

- selecting a person highlights their assigned issues;
- selecting an asset highlights related issues;
- selecting an issue highlights its assignee;
- "Locate in world" moves/focuses the camera on the related entity.

Do not invent relationships from matching names.

## Acceptance gate

At least one real relationship from Forma/APS can be followed visually in both directions.

**STOP HERE.**

---

# Phase 8 — First write-back from the world to Forma

## Goal

Prove that the world is an **interface**, not merely a visualization.

Start with the safest, clearest write action:

# Create a non-placement Issue

Do not begin with model-placement issues.

## User flow

```text
Select person or asset
        ↓
Create Issue
        ↓
Title
Description
Assignee
        ↓
Confirm
        ↓
APS Issues API
        ↓
Issue created in Forma
        ↓
World refreshes
        ↓
New issue appears in world
```

## Requirements

- mutation happens only after explicit user confirmation;
- show API failure clearly;
- do not pretend it succeeded before APS confirms;
- preserve the returned APS issue ID;
- refetch/merge the resulting entity into world state.

Then add, one at a time:

1. assign/reassign issue;
2. update supported issue fields;
3. update supported issue status.

## Acceptance gate

Create an issue inside FormaWorld and verify manually that the same issue exists in the Autodesk Forma UI.

Then change it in Forma and verify that a manual refresh in FormaWorld reads the updated state.

**STOP HERE.**

---

# Phase 9 — Make project state drive physical behavior

## Goal

Turn data state into game-world behavior.

This is where the project begins to feel alive.

## Asset state machine

Example:

```text
Pending
   ↓
Warehouse

In progress
   ↓
Production

Ready for delivery
   ↓
Loading Bay

Delivered
   ↓
Delivery / Site
```

The exact mapping must be configurable per project.

## Transition animation

When an entity changes from one semantic zone to another:

```text
old APS state
     ↓
new APS state detected
     ↓
WorldEntity changes zone
     ↓
World Action generated
     ↓
animation plays
```

Example:

```text
Asset status:
Pending → In Progress

World:
pallet leaves warehouse
forklift animation plays
pallet arrives in production
```

Forklifts, trucks and workers can initially be **visual actors only**.

They do not need their own backend state.

## Important architecture rule

Animation is a reaction to state.

Do not make animation the source of business state.

---

# Phase 10 — World actions that update Forma

Only implement this after read-only state-driven movement is stable.

Example:

A user drags a pallet from:

```text
Warehouse
```

to:

```text
Production
```

The app should **not silently PATCH Forma**.

Instead:

```text
Move AHU-0042 to Production?

This will change:
Status: Pending → In Progress

[Cancel] [Confirm]
```

After confirmation:

```text
World intent
    ↓
validate mapping
    ↓
APS mutation
    ↓
APS success
    ↓
update normalized state
    ↓
animate object
```

If APS rejects the change, the object remains in its original authoritative state.

## Acceptance gate

At least one deliberate world interaction causes a verified supported update in Forma and then reconciles back into the world.

**STOP HERE.**

## Phase 10 implementation note (completed)

- Asset inspectors load the selected project's real status IDs and can submit a
  confirmed status transition through the official Assets batch-patch endpoint.
- Issue inspectors load the individual issue's `permittedAttributes` and
  `permittedStatuses`; only APS-permitted status transitions are offered.
- Form inspectors support a confirmed submission when the live form includes a
  template ID and is not already submitted.
- All three flows require `data:write`, same-origin JSON requests, server-side
  revalidation, APS confirmation, and feed reconciliation.
- No object is dragged to change business state. People and Documents remain
  read-only. Unsupported permissions/states are shown honestly in the inspector.

---

# Phase 11 — Near-real-time synchronization

## Goal

Changes made outside the game should appear without requiring the user to reload the application.

Do not assume every Forma module exposes the same event capabilities.

Create a generic sync layer:

```text
APS webhook / polling
        ↓
Sync event
        ↓
refetch affected resource
        ↓
normalize
        ↓
diff old/new state
        ↓
update World Store
        ↓
optional world animation
```

## Use push where officially supported

Prioritize webhook support for resource types where APS exposes suitable events, especially Issues and relevant Data Management events.

## Use polling where necessary

For a resource without a suitable push event, use controlled polling.

Do not poll every API aggressively.

Example strategy:

- active world: modest interval;
- background tab: slower interval;
- manual refresh always available;
- periodic full reconciliation even when webhooks are enabled.

## Browser update channel

Once the server receives an event, push world updates to the browser with a simple realtime transport such as SSE or WebSocket.

Choose the simplest option that fits the deployed runtime.

## Event safety

Implement:

- duplicate event protection;
- reconnect behavior;
- event logging in development;
- stale-state reconciliation;
- no duplicate animation when the same state arrives twice.

## Acceptance gate

Test two directions:

### Forma → World

1. Open FormaWorld.
2. Change an issue/state in Autodesk Forma.
3. World updates without a page reload.
4. Relevant visual state changes.

### World → Forma

1. Perform supported action in FormaWorld.
2. APS confirms write.
3. Autodesk Forma shows the change.
4. Sync/reconciliation does not create a duplicate change.

**STOP HERE.**

---

# Phase 12 — Project-specific world rules

Once the generic platform works, allow a project to define how data should look and behave.

Example config:

```ts
const worldRules = {
  assetStatusZones: {
    pending: "warehouse",
    in_progress: "production",
    ready_for_delivery: "loading-bay",
    delivered: "site",
  },

  visuals: {
    asset: "pallet",
    issue: "warning-marker",
    form: "clipboard",
    person: "worker",
    document: "document-box",
  },
};
```

Later this can become editable UI.

For MVP it can remain a small configuration file.

---

# Entity → world metaphor

| Forma/APS entity | Initial world representation | Initial interaction |
|---|---|---|
| Project | Main world / Project Hub | Enter project |
| Asset | Pallet / crate / equipment | Inspect state |
| Issue | Warning marker / beacon | Inspect, later create/update |
| Document | Folder / shelf / terminal | Inspect metadata |
| Form | Clipboard / checkpoint | Inspect |
| Project user | NPC | Inspect assignments |
| Company | Optional building/team zone | Filter/highlight members |
| Status | Zone + visual state | Drives movement |
| Relationship | Highlight/link/focus | Navigate connected entities |

---

# World state principles

Keep these three concepts separate:

## 1. Source state

What APS actually says.

```text
asset.status = "Pending"
issue.assignee = "..."
```

## 2. Derived world state

How that data is represented.

```text
Pending → Warehouse
Ready → Loading Bay
```

## 3. Presentation state

Temporary visual state.

```text
selected
hovered
animating
highlighted
cameraTarget
```

Never write presentation state back to Forma.

---

# Suggested folder responsibilities

Exact names can follow the existing repo, but keep responsibilities separated.

```text
src/
  app/
    auth/
    project/
    world/

  components/
    world/
    ui/

  aps/
    auth/
    data-management/
    assets/
    issues/
    forms/
    users/

  world/
    entities/
    adapters/
    rules/
    store/
    animations/
```

Avoid large generic `utils.ts` files.

Keep API response types close to their APS module and world types inside `world/`.

---

# UX rules

1. The world is the main UI.
2. Avoid giant dashboard panels.
3. Clicking an object should reveal only the most relevant information.
4. The user must always know which Forma project is open.
5. Real APS data and symbolic visualization must be distinguishable.
6. A destructive/business-changing action requires clear confirmation.
7. Loading/permission/error states must be visible.
8. Do not hide API limitations behind mocked data.
9. Keep the first visual style simple and coherent.
10. Make it fun to explore without turning it into gamification for its own sake.

---

# Explicit non-goals for the first MVP

Do **not** build these until the core loop works:

- full Autodesk Viewer/BIM model;
- realistic first-person navigation;
- multiplayer avatars;
- chat;
- voice;
- AI agents;
- AI-generated project data;
- XP/coins/achievements;
- complex physics;
- vehicle simulation;
- pathfinding for hundreds of NPCs;
- custom 3D modeling pipeline;
- exhaustive document trees;
- all Forma modules;
- mobile app;
- offline synchronization;
- microservices;
- Kubernetes;
- event sourcing;
- a custom game engine.

---

# Definition of the first convincing MVP

The MVP is successful when a user can:

1. Sign in with Autodesk.
2. Select a real Forma project.
3. Enter an isometric 3D project world.
4. See real project Assets.
5. See real Issues.
6. See selected Documents.
7. See Forms.
8. See Project Users as NPCs.
9. Click those entities and inspect real metadata.
10. Follow at least one real relationship.
11. Create a real Issue from the world and see it in Forma.
12. Change supported state in Forma and see the world react.
13. See at least one Asset physically move between world zones because its authoritative project state changed.

That is enough to prove the central idea:

> **A live, playable spatial interface for Autodesk Forma.**

---

# Start here — instruction to the coding agent

**Implement Phase 1 only.**

Before coding:

1. inspect the repository;
2. identify the existing framework and package manager;
3. preserve working code where possible;
4. verify the current official APS authentication and Data Management requirements;
5. write a short implementation plan for Phase 1 in your own task notes;
6. implement APS login + hub/project selection;
7. test it against a real Autodesk account/project;
8. run the production build;
9. summarize the result;
10. stop.

Do not create the 3D world, entity model, Assets integration, Issues integration, Forms integration, NPCs, realtime layer or write-back yet.

The only objective of the first implementation pass is:

```text
AUTODESK LOGIN
      ↓
GET HUBS
      ↓
GET PROJECTS
      ↓
SELECT PROJECT
      ↓
SHOW VERIFIED PROJECT CONTEXT
```
