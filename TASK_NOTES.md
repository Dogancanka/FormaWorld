# Phase 1 task notes

All implementation phases must follow `WORLD_PRODUCT_CONTRACT.md`: the world is
the primary spatial view of real Forma project state, not a dashboard decorated
with 3D objects.

World interaction baseline: semantic districts are themed and their project-specific
layout can be arranged only in an explicit edit mode. Entities move only as a
visual reaction to authoritative APS state. Relationships and near-real-time
reconciliation are first-class product requirements.

1. Scaffold a minimal Next.js App Router application with TypeScript.
2. Add server-only APS OAuth v2 authorization-code handling with CSRF state,
   encrypted cookie sessions, token refresh, logout, and visible API errors.
3. Read hubs and projects from APS Data Management and validate selection on
   the server before storing a compact project context.
4. Add landing, picker, and selected-project screens.
5. Run unit tests, lint, and a production build. Real-account verification
   requires user-provided APS credentials and an Autodesk account/project.

## Phase 2

1. Probe Documents, Issues, Assets, Forms, and People independently.
2. Limit every request to a small first page; do not recursively crawl data.
3. Normalize only the fields needed by the temporary inspector.
4. Preserve honest empty, permission, unsupported, and API error states.
5. Render a refreshable Project Data Inspector after project selection.
6. Record observed capabilities in `APS_CAPABILITIES.md`, then run tests, lint,
   and the production build.

## Phase 3

1. Add a dedicated, authenticated `/world` route for the selected project.
2. Render an orthographic isometric scene with pan, zoom, shadows, and a large grid.
3. Add eight semantic project zones using placeholder geometry only.
4. Support hover, selection, a compact detail panel, and zone navigation.
5. Keep all positions explicitly described as symbolic rather than physical data.
6. Verify tests, lint, production build, and the local route.

## Phase 4

1. Define one small `WorldEntity` model for APS-backed world objects.
2. Add one explicit adapter per Phase 2 source.
3. Preserve each raw APS record under `metadata.raw` while the model evolves.
4. Do not assign zones, positions, or inferred relationships in this phase.
5. Verify adapter behavior with unit tests and a production build.

## Phase 5

1. Fetch at most 25 real Assets for the selected project.
2. Resolve status/category display names where the project exposes settings.
3. Map known status names through a configurable world rule; hold unknown
   statuses in the Asset Warehouse without inventing meaning.
4. Render normalized Assets as selectable pallets/crates in their mapped zone.
5. Show only metadata actually returned by APS and expose API limitations.
6. Verify mapping tests, lint, production build, and a real-project result.

## Phase 6A — Issues

1. Fetch up to 50 real Issues from the selected project without mock records.
2. Preserve one world marker per returned APS issue and expose the actual total.
3. Derive open, answered, closed, and overdue presentation states from APS fields.
4. Render selectable warning markers and show only metadata returned by APS.
5. Remove decorative issue placeholders when live records are present so counts stay honest.
6. Verify rule tests, lint, production build, and the live project result.

## Phase 6B — Documents

1. Read real Data Management top-level folders and a limited first-folder page.
2. Normalize each shown resource into one traceable WorldEntity.
3. Render folders and files in a collision-free reserved library yard.
4. Show available type, version, created, and modified metadata on selection.
5. Expose the exact loaded scope rather than implying a complete recursive tree.
6. Keep document data on the same 30-second reconciliation cycle.

## Phase 6C — Forms

1. Fetch up to 25 real forms from the selected project without mock records.
2. Normalize every returned form into one traceable WorldEntity.
3. Render each form as a selectable checkpoint in a reserved station yard.
4. Use source status only for checkpoint color and show real returned metadata.
5. Preserve honest empty, permission, unsupported, and error states.
6. Keep Forms on the same 30-second reconciliation cycle.

## Phase 7 — Relationships

1. Read documented relationship records from the APS Relationship API with the
   selected project UUID as container ID.
2. Resolve only explicit `{ domain, type, id }` endpoints to already loaded
   world entities. Unknown domains and unloaded records remain unresolved.
3. Treat an Issue API `assignedTo` identifier as an explicit Issue ↔ Person
   relationship when it exactly matches a loaded project user's `id` or
   `autodeskId`.
4. Never infer a relationship from titles, names, locations, or proximity.
5. Show verified related entities in every entity inspector and make each link
   navigable in both directions with a camera focus action.
6. Refresh relationship data on the same 30-second reconciliation cycle and
   preserve visible empty, permission, unsupported, and error states.
7. Keep issue markers free of badges and place up to 50 returned issues in a
   collision-free 0.58-unit grid so every marker remains independently clickable.

## Phase 8 — First APS write-back

1. Request `data:write` in the existing 3-legged OAuth flow. Sessions created
   before this phase must explicitly sign in again before mutation is enabled.
2. Start only from a selected real Person or Asset and create a non-placement
   Issue; no pushpin or model placement is written.
3. Load valid project issue subtypes from APS and validate the chosen subtype
   again on the server immediately before creation.
4. If an assignee is provided, require an exact ID match against a loaded real
   project member. An Asset is context only until a verified reference write is
   implemented.
5. Require same-origin JSON, bounded fields, a separate review screen, and an
   explicit “Confirm & create in Forma” action.
6. Show success only after the APS POST returns the created issue and its stable
   APS ID. Preserve the returned entity and immediately reconcile the Issue feed.
7. Surface APS failures without changing authoritative world state.

## Phase 9A — Connected world and verified activity

1. The earlier fixed road experiment was removed in Phase 9B because editable,
   growing districts made those roads misleading and prone to collisions.
2. Keep all R3F HTML labels below HUD, inspectors, and mutation dialogs in the
   visual stacking order.
3. Detect issue activity only by diffing consecutive APS snapshots. The first
   snapshot and unchanged data never produce activity.
4. Distinguish verified status changes, assignee changes, and generic issue
   updates. Do not call a generic update a comment without comment API evidence.
5. Match activity actors and newly assigned workers to real People entities by
   explicit APS identifiers only.
6. When a real person matches observed activity, animate that NPC from Project
   Village to Issue Garden, pause to work, and return. Animation remains a
   read-only reaction and never becomes project state.
7. Keep a session-local, clickable activity log of the latest observed changes;
   each entry navigates to the corresponding loaded issue.

## Phase 9B — Editable persistent world layout

1. Remove the road network; movable and growing districts make fixed roads
   misleading and visually unsafe.
2. Keep entity interaction read-only. Only complete districts can move, and only
   after the user explicitly enters Edit layout mode.
3. Disable camera pan while editing, provide Reset, Cancel, and Save layout, and
   make unsaved edits reversible.
4. Save validated district center positions per Forma project in browser-local
   storage so the layout survives browser and development-server restarts.
5. Derive district footprint from current represented live content. Position and
   footprint are separate: later growth must not overwrite the saved center.
6. Resolve growing footprints to collision-free display positions and reject any
   Edit layout drag that would intersect another district.
7. Keep every domain's scenery and live entities in separate deterministic lanes;
   People use a bounded front lane that never reaches the village work area.

## Phase 9C — Relationship signals and district inspection

1. Place district labels outside the front edge of each tile so buildings and
   entity clusters remain unobstructed.
2. Treat each focus request once. Live feed refreshes must never re-trigger an
   old camera focus or fight the user's attempt to zoom out.
3. Draw only resolved APS relationships whose two loaded endpoints have exact
   world positions, and only for the currently selected Issue. Use clear blue
   arcs with a bidirectional moving pulse and cap the visible set. No selection,
   district selection, or non-Issue selection may leave wires visible.
4. Opening or focusing a district shows its real loaded contents, available
   source total, domain breakdown, and direct Inspect actions in the right panel.
5. A Person relationship section exposes a compact Locate all action only when
   verified related Issues exist. It frames People and Issues and draws every
   loaded Person-to-Issue link until selection changes or the inspector closes.

## Phase 10 — Confirmed world actions

1. Reload live APS capabilities before every Asset, Issue, or Form mutation.
2. Require a separate review step and explicit confirmation for every write.
3. Treat the returned APS entity as authoritative and reconcile its feed immediately.
4. Keep People and Documents read-only until a documented action is available.

## Phase 11 — Controlled near-real-time reconciliation

1. Reconcile Assets, Issues, People, Documents, Forms, and Relationships together.
2. Poll an active world every 30 seconds and back off to 120 seconds in hidden tabs.
3. Refresh immediately when the world becomes visible or the browser reconnects.
4. Deduplicate overlapping triggers and repeated issue activity events.
5. Expose current, syncing, partial-error, and last-sync state with a manual refresh.
6. Keep polling as the honest transport until supported APS webhook events and a
   deployable shared event channel are configured and verified.

## Phase 12 — Edit-layout UX and world craft

1. Edit layout uses free dragging: the district follows the pointer, invalid
   targets tint the plinth red live, and an invalid drop reverts to the last
   committed position instead of silently refusing to move.
2. Districts are clamped to ±16 so a fixed edit-mode camera can never lose one;
   camera pan stays disabled while editing per the product contract.
3. Enter saves and Escape cancels the layout; entity selection is suppressed in
   edit mode so drags never open inspector panels.
4. Procedural brick and shingle textures (`src/world/visual/textures.ts`,
   cached canvas textures) dress the keep with corner towers, the warehouse with
   a gabled roof, plus loading-canopy, production-pipe and forms-gate details.
5. Issues render as status signposts — clearly informational and distinct from
   the decorative garden flowers, per the product contract on decorative vs
   authoritative objects; forms become checkpoint totems and documents become
   archive folders or drawing sets with coloured spines.
6. NPCs wear deterministic two-tone outfits with legs, shoes, hair and headwear
   variants so real project members read as inhabitants first.
7. District beacons fade in when zooming far out, keeping every district
   locatable at overview distance — the legibility hook for a future multi-world
   view of several project worlds sharing one camera.
8. The top HUD stays one compact pill; relationship wires anchor at issue-post
   height instead of floating above markers.

## Phase 13 — The walled compound (UX_CHANGE.md section 1)

1. Replace the cream display surface and the floating district plinths with one
   continuous warm green ground plane; every district is now a flat ground pad
   with a sandstone kerb resting directly on it.
2. Enclose the whole project in a blocky sandstone wall with corner towers,
   battlements, a main gate facing the default camera and a west service gate.
3. Derive the enclosure from the district footprints it must contain
   (`src/world/compound.ts`), so growth and Edit layout moves can never put a
   district outside the wall. Edit-layout drag is clamped to the wall interior
   instead of the old fixed ±16 box.
4. Connect the districts with flat dirt paths: one elbow from the central
   Project Keep to every other district plus an approach road per gate,
   re-derived from the current district centres on every layout change. Paths
   are civic layout, never a relationship — see `WORLD_PRODUCT_CONTRACT.md`.
5. Retune the palette to warm city-builder tones (rich green grass, sandstone
   and terracotta, brown paths) and rebalance the light rig, which had been
   tuned for the old cream surface and washed out saturated ground.
6. Spread the default district plan so the paths between districts stay visible,
   and frame the whole compound at the default camera zoom.

## Phase 14 — The Construction Village refactor

1. Remove the editable layout entirely: no Edit layout button, drag handling,
   collision resolution, per-project `localStorage` layout, or content-driven
   district growth. `src/world/layout.ts` now exposes one fixed `zonePositions()`
   shared by every project world.
2. Remove the raised district pads. `ZoneGround` draws a flat worked-ground
   patch flush with the terrain, so buildings, entities and props all stand
   directly on dirt or grass.
3. Rebuild every district as a village structure from combined primitives
   (`Cabin` = footing + walled body + pitched roof; `Canopy` = poles + canvas):
   Site Office, Blueprint Office, Repair Yard, Material Yard, Fabrication Shop,
   Loading Dock, Inspection Post, Crew Camp. Zone ids are unchanged so asset
   status rules, relationships, and inspectors keep working.
4. Re-theme the entity meshes to the site metaphor: assets are lumber stacks,
   pipe bundles or pallets of bagged material (form chosen deterministically per
   record); issues are broken machines behind warning barricades that keep
   smoking while open or overdue; the Issue Garden beds became marked-out repair
   bays with no planting.
5. Scatter procedural props on the open grass — pine trees, site barrels,
   crates, lumber piles and rocks — clear of districts and paths.
6. Deterministic crew identity (`src/world/people/identity.ts`): the avatar
   palette and build are hashed from the Autodesk account id, falling back to
   email, and only then to the project membership id. The same person renders
   identically in every project world; NPC geometry is now a boxy torso with a
   hi-vis vest, reflective bands and a hard hat.

## Phase 15 — Contrast, spacing, and strict terminology

1. Rebuild the material palette around contrast: district ground stays earth or
   asphalt, so structures and entities now use painted steel, white panelling
   and pale timber. No structural surface reuses a dirt-adjacent brown.
2. Replace the enclosed buildings in the working districts with open structures
   — a steel portal frame over the Assets yard, a frame plus running conveyor
   for Assets: In Progress, and the open loading deck and gantry for
   Assets: Ready. The Issues district has no structure at all.
3. Move every district structure to the back of its district and run the entity
   lane across the front (`layoutPeople` and the document/form grids flipped
   accordingly), so live records are never hidden behind scenery.
4. Name each district with a physical signpost at its front edge instead of a
   label pinned to a building. Districts no longer show a hover-only label.
5. Issues district: asphalt ground, painted bay markings, and one traffic cone
   per issue (`ConeGeometry` on a flat square base) whose colour is the APS
   state. `issueStateColor` re-tuned to site-signal semantics.
6. Asset spacing and hit targets: new `src/world/assets/layout.ts` grid, shared
   by the rendered stacks and the relationship wire anchors, with the three asset
   yards enlarged to hold it. Click targets are transparent boxes covering the
   whole grouped object — the previous `visible={false}` hit meshes are skipped
   by the pointer system, which is why only the tiny sub-meshes were clickable.
7. Strict Autodesk terminology in every label: Project, Documents, Issues,
   Forms, Project Members, Assets, Assets: In Progress, Assets: Ready. The site
   metaphor now lives only in geometry.

## Phase 16 — Signage, responsive bays, and click targets

1. Signposts carry the district's colour and chevron markings but no text. The
   permanent floating district names were noise; the name is already shown on
   selection.
2. Issue bays are responsive (`src/world/issues/layout.ts` rewritten): each APS
   state gets a painted bay sized to the records it holds, with a cone grid whose
   spacing shrinks only as far as needed to keep every cone inside the box. The
   issues district was enlarged to 14.0 x 9.2 to hold five bays, and the compound
   padding tightened so the wall still hugs the site.
3. The three asset districts now share one structure (`AssetYardStructure`) and
   one footprint, so they read as the same kind of place at different statuses.
   The translucent roof sheets were removed from `SteelFrame`.
4. Click targets are matched to each entity's own silhouette instead of being
   generously oversized. The oversized boxes were what blocked hovering the
   records standing behind — not the grid spacing, which is back to a normal
   density bounded by `ASSET_STACK_FOOTPRINT`.
5. Loose crates and barrels were removed from the ambient scatter and from
   district decor; only pine trees, rocks, fences and site floodlights remain.

## Phase 17 — Live asset statuses, RFIs, and road routing

1. Asset districts are now generated from the project's own APS asset statuses
   (`/bim360/assets/v1/projects/{id}/asset-statuses`): one district per real
   status, named after it, all the same size. The hand-written
   `src/world/rules/asset-status.ts` name-to-yard mapping was deleted — an asset
   goes to the district of its own status id, and only an asset whose status is
   outside the project's set is held in `asset:unresolved`. `ZoneId` is now a
   string and district visuals are keyed on `ZoneKind`, not on id.
2. RFIs are a first-class domain: adapter, feed types, `/api/world/rfis`, an RFI
   district with a query desk, one notice board per RFI coloured by APS status,
   an inspector, HUD counts, and the `autodesk-bim360-rfi` relationship domain.
   The client tries both documented route forms (containers and projects) and
   only retries on a 404/405/501 — a permission failure is reported as such.
3. Forms rendered nothing while pagination reported records, because ACC Forms
   v2 returns its page under `data` rather than `results`. `src/lib/aps/
   collection.ts` reads the documented key, falls back to any other array of
   records, and logs which key it used, so a wrong guess is visible in the server
   log instead of silently emptying a district.
4. District signposts were removed entirely: they carried no information the
   selection panel does not already give.
5. Roads no longer run onto districts. Of the two right-angled routes to a
   target the one crossing least district ground is chosen, the remainder is
   clipped at the kerb, and collinear lanes are merged so a shared stretch is
   drawn once instead of stacking rectangles.

## Phase 18 — Category-driven materials and living asset stages

1. A material stack's form and colour now come from the asset's APS category
   (`src/world/assets/materials.ts`), never from a hash of the record id. Six
   forms — lumber, pipes, pallet, drums, panels, fittings — are assigned by the
   category's position in the project's own category list, so every asset in a
   category looks the same and two categories never look alike. Assets APS
   returned without a category share one neutral appearance.
2. `listWorldAssets` now returns the project's ordered categories alongside its
   statuses, and each asset carries its `categoryId`.
3. Yards are laid out in category bands (`layoutAssetGroups`): each category gets
   its own run of rows with a marked bay on the ground, spacing tightening only
   as far as needed to keep every band inside the fence and every click target
   separate.
4. Asset districts are no longer interchangeable. `src/world/assets/stage.ts`
   derives a stage from the status's position in the project's own ordered status
   list — first is intake, last is dispatch, the rest are work — and each stage
   gets its own living yard: a flatbed truck at an unloading ramp with a goods-in
   beacon, a running conveyor with a cutting/welding/press station that varies by
   position, or a loading deck with a gantry, wrapped pallets and a loaded
   outbound truck. The stage is presentation only and the district panel says so.

## Phase 19 — One Material Yard, and variety without the categories API

1. Assets were read as a single 25-record page, which hid most of a real
   project's assets and most of its categories. `listWorldAssets` now pages up to
   300 records, following whichever paging style APS answers with (`nextUrl`,
   `cursorState`, or offset) and logging each page.
2. One asset district replaces the per-status districts. `layoutAssetYard` plans
   the whole workflow as a single yard read left to right: intake equipment at
   the start, one lane per APS status in the project's own order, dispatch
   equipment at the end. Lane width and yard footprint follow the status count,
   capped so a long workflow cannot stretch the compound without limit. A status
   change now moves an asset one lane along the same yard.
3. The categories API returns nothing for many projects, which made every asset
   fall back to one grey appearance. `assetAppearance` now hashes what the record
   itself carries — its own category text, else its title — into the same six
   forms and eight colours, so a yard is always a readable mix of timber, pipe,
   drums and panels. `AssetAppearance.categorised` records whether the look came
   from a resolved category, so the world never claims a categorisation it lacks.
4. Proportions: material stacks are drawn at 1.32x and the steel frames are gone
   entirely — the repeated gantries were the bulk of the visual noise. The
   intake and dispatch equipment now appears once, at the two ends of the yard.
5. `src/world/assets/stage.ts` was deleted with the per-status districts; the
   left-to-right yard shows the workflow directly instead.

## Phase 20 — Set dressing and ambient life

1. New props, all built from primitives and all opting out of raycasting via a
   shared `ignoreRaycast`, so none of them can intercept a click meant for a
   project record: mobile crane with a slewing boom, Jersey barrier, dirt mound,
   site office container, pickup truck, wheelbarrow, bush and rock cluster.
2. Issues yard: the crane parks in the one bay slot the five issue states leave
   free, so it adds height to the flat asphalt without standing over any cone.
   Two barriers line the front edge and a spoil heap sits at the far corner.
3. Crew camp: a site office container joins the mess canopy and brazier, and a
   crew pickup parks along the far edge. The district was widened to 9.0 x 7.2
   and the camp re-laid across it so container, canopy, brazier and pickup each
   stand clear rather than hiding behind one another.
4. Ambient scatter is denser and more varied — pine trees, bushes, rock clusters
   and the occasional wheelbarrow — with the cap raised from 64 to 96 props.
5. Verified in the browser that crew figures stay individually hoverable with
   props around them, and that clicking straight at the crane or the container
   opens no inspector.

## Phase 21 — Surviving a slow APS, and two tents removed

1. The Issues district was disappearing on `HTTP 504`. Three changes:
   - `requestApsJson` now has a 25s timeout and retries once on a transient
     status (408/425/429/500/502/503/504). A 401/403/404 is never retried.
   - `listWorldIssues` falls back to a smaller page (50 → 25 → 10) when the
     gateway times out, and reports the limit it actually used, so a busy
     project shows fewer issues instead of none.
   - A feed that fails to refresh no longer blanks its district: `keepLastKnown`
     preserves the last records, marks the feed `stale`, and the alert reads
     "not refreshed · showing the last records APS returned".
2. The mess tent is gone from Project Members; the container is the crew's
   shelter and the trestle tables stand open beside it. The pickup moved clear of
   the district tree, and the People district now carries a single lamp post
   instead of a tree that stood inside the parked truck.
3. The tent is gone from the RFI district too — the query desk and question
   board read better open. `Canopy` and `CANVAS_TENT` were deleted with them.

## Phase 22 — Beacons out, room to breathe, water in

1. `DistrictBeacon` is gone. The additive columns it drew at low zoom read as
   light beams shooting out of the world rather than as district markers.
2. Compound padding raised from 1.0 to 2.6, so the wall no longer crowds the
   issue yard and the material yard, with the default camera zoom dropped to 19
   to keep the wider compound in frame.
3. New `src/world/water.ts` places ponds inside the walls and open water in the
   meadow, deterministically from the compound's own geometry. Nine tests hold
   the invariants: water never covers a district, a road or the wall, bodies
   never overlap each other, the count stays bounded, and the same world always
   produces the same water. Clearances inside the walls are deliberately tight —
   the interior is almost entirely district and road, and a generous margin left
   no room for a pond at all.
4. `WaterBodies` renders each body as a low-poly basin: wet sand rim, water
   surface, a lighter shelving edge, one expanding ripple, and reeds on the bank
   for the ponds. Every mesh opts out of raycasting, and `pointClearOfWater`
   keeps the ambient scatter from dropping trees into the water.

## Phase 23 — Natural shorelines and an open horizon

1. Water no longer animates. The expanding ripple pulled the eye away from the
   project data, which is the only thing in the world whose movement carries
   meaning.
2. Ponds and lakes are irregular. `waterOutline` builds a closed loop from three
   low-frequency waves seeded per body, rendered with `ShapeGeometry`, so banks
   curve like a shoreline instead of reading as discs. The shape factor is
   capped at 1.0 of the body's radius, so an irregular outline can never reach
   ground the round placement rules cleared — six tests hold that, including
   that the wet bank stays inside the tightest clearance the placement uses.
3. The world edge is gone. The ground plane went from 240 to 900 units, the
   camera far plane to 600, and the fog colour was set to exactly the background
   colour (`#d9e7dd`) so terrain dissolves into the horizon rather than ending at
   a visible square against a different-coloured sky. Verified at minimum zoom:
   the ground now fills the frame with no edge in view.

## Phase 24 — The bottom edge

The world still ended in a hard horizontal line across the lower frame. Making
the ground plane bigger could not fix it, because the cut was not the plane
running out: an orthographic camera clips everything that falls in front of its
own near plane, and the terrain running toward the viewer did exactly that. The
clip range is now symmetric and negative on the near side (`near: -1200`,
`far: 1200`), so nothing between the camera and the horizon is cut away.
Verified at a 2000x900 viewport at minimum zoom: grass reaches every edge of the
frame. The directional light's shadow camera was widened from ±24 to ±34 to
cover the compound at its current size.

## Phase 25 — Issue yard craft

1. The white hatched approach stripes are gone from the issue bays; the painted
   outline alone marks a bay.
2. The mobile crane is turned a quarter turn (`Math.PI / 4`), which puts its long
   axis across the isometric view so the boom is read from the side instead of
   end-on.
3. New issue-yard props, all opting out of raycasting: a tube `Scaffold` with a
   boarded deck, toe board and ladder; `HazardFenceRun`, a run of orange barrier
   panels on weighted feet; and a triangular `WarningSign`. They stand in the
   corridor between the two rows of bays, which is the only continuous open
   ground in the yard.

## Phase 26 — The crane was in pieces

1. The boom was not attached to the machine. It was positioned in the crane's
   own space with a hand-computed offset that did not land on the turret, so its
   lower end sat below the chassis and off to one side; the slewing animation
   then swung it further away, and the hoist rope and hook hung in open air. The
   crane is rebuilt with the boom inside a pivot group whose origin *is* the
   turret, every boom part laid out along that group's own axis, and the boom
   tip computed once and shared with the rope and hook. It cannot come apart now
   however the crane is turned. The slew animation is gone with it.
2. The barrier fencing in the middle of the yard is removed. Standing in open
   asphalt it fenced nothing off, and at the isometric angle one run was seen
   edge-on and read as a stray coloured post. `HazardFenceRun` was deleted; the
   scaffold and the warning sign stay.

## Phase 27 — The panel now matches the world

1. `src/world/entities/grouping.ts` groups a district's records the way the world
   lays them out: assets by the project's own APS status order, which is the
   order of the lanes in the yard, and issues by bay order. Unresolved statuses
   sort last and are labelled from the record's own status text. Eight tests
   cover the ordering and that every record is kept exactly once.
2. `src/components/world/entity-icon.tsx` draws each row's icon from the same
   data as its 3D object: `assetAppearance` picks the material glyph and colour,
   `issueStateColor` colours a traffic cone, and `personAppearance` builds a mini
   portrait with that member's own vest, helmet and skin. Documents, forms and
   RFIs get glyphs matching their world objects. The icons are used in both the
   district contents list and the relationship list.
3. The district list is now split under per-status headings with counts, the
   summary chips show those same groups, and the shared display limit is applied
   once up front rather than by mutating a counter during render.
4. The row grid selector was widened to match rows inside a status group —
   without it the rows stacked icon-over-title.

## Phase 28 — Ambient life, gamification and HUD

Set dressing from the earlier pass was already in place and was checked rather
than rebuilt: the mobile crane, two Jersey barriers and a dirt mound in the
issues yard; the site office container and parked pickup in Project Members;
and the procedural rocks, bushes and wheelbarrow on the open grass. All of it
still opts out of raycasting through `ignoreRaycast`.

1. `src/world/rules/due-date.ts` reads a `dueDate` off a record — the promoted
   field or the untouched APS record underneath it — and turns it into a health
   reading: full at thirty days out, running down inside the last seven, spent
   once the date has passed. Nine tests.
2. `DueDateHealthBar` floats that reading over the issue cone and the RFI board
   with drei's `<Html>`, and `OverdueSmoke` sets an overdue record on fire in 3D.
   Both are inert to the pointer, which was verified by sweeping the overdue bay:
   every cone still answers hover through its neighbours' chips.
3. Two corrections found by looking at it. A *labelled* chip over every dated
   record turned the issues yard into a wall of overlapping white boxes with no
   cones visible. Hiding the healthy ones fixed that but cost the reading the
   whole point — every dated record shows its bar. What was cut instead is the
   size: the ambient chip is a 24x5 bar on a dark plate with no text, and the
   numeric reading belongs to the marker under the pointer. And the smoke was
   tinted charcoal, which disappeared into the dark asphalt it stood on; it is
   pale now.
4. `src/world/progression/` holds the progression logic: `xp.ts` (a widening
   level curve; level 1 costs 250, level 2 costs 500), `away-log.ts` (the mocked
   arrival digest, built from real counts and real names so it cannot contradict
   the world), and `store.ts` (a dependency-free `useSyncExternalStore` singleton
   persisting XP per project). Twelve tests. Zustand was not added — the whole
   surface is one number and a change counter.
5. The HUD: `XpMeter` and `AwayLog` in `progression-hud.tsx`, and a bottom-centre
   `WorldActionBar` with Reset view and Create issue. Acknowledging a digest line
   grants +25 XP, glows the meter, floats a `+25` and drops the line. Verified in
   the browser: 0 → 50 XP over two acknowledgements, surviving a reload.
9. A digest line can now prove itself. Acknowledging was the only thing a line
   could do, which asked the reader to take "4 issues went overdue" on trust with
   no way to find the four. Every `AwayEvent` now carries `zone` and `entityIds`,
   and clicking the row body flies to that district, rings exactly those records
   in the world with an amber `HighlightRing`, and narrows the inspector to them
   under a "FROM THE DIGEST" heading with a "Show all N" way back. The highlight
   set is threaded from `WorldScene` into the asset, issue, RFI, form and person
   markers; the ring is deliberately a different colour and radius from the
   selection ring, because one record can be selected while a whole group is
   shown. Picking a district by hand or clicking empty ground clears it;
   inspecting one record inside the group does not. Verified end to end in the
   browser for both the Issues and the Assets line.
6. The left edge is now one `.world-rail` flex column holding the meter, the feed
   alerts and the digest. They used to be absolutely positioned at fixed offsets
   and would have overlapped each other as soon as two were visible.
7. Reset view frames the compound by asking the render loop to fit its footprint
   — only the loop knows the viewport — rather than by guessing a zoom number.
8. Create issue from the tool bar opens the existing composer with no context.
   The spec asked for a placeholder form; the real write-back already works, so
   a second fake dialog would have been a downgrade. `context` is optional now.


## Phase 29 — English throughout, a real logo, and state that survives

1. The pre-world pages were Danish and the world was English. Every user-facing
   string in `src/` is English now — landing, picker, project page, inspector,
   error page, and the server messages in `project-data.ts`, the OAuth callback
   and the project-selection route. `<html lang>` follows. The world components
   needed no change.
2. The brand mark was the letter F in a box. It is an isometric cube now
   (`src/components/brand-mark.tsx`, mirrored as `src/app/icon.svg` for the tab):
   lime top face, green left, dark green right — the same block the world is
   built out of, and legible at 32px where a letterform was just a letter.
3. The landing page's illustration was a fake isometric grid with two cards
   labelled AUTODESK and PROJECT and a line between them. It claimed a
   connection that did not exist and was deleted with its eight CSS rules. The
   hero is one centred column: eyebrow, headline, lede, one button, five pills
   naming what is inside, security note.
4. The project page led with a 160px monogram tile and a metadata table. It
   leads with the project name now; IDs are in a collapsed `<details>`, and the
   Project Data Inspector is a collapsed panel that **fetches on first open**.
   It used to fire five parallel APS probes on every project page load.
5. `src/components/world-horizon.tsx` puts the pages on the world's ground: sky
   and grass are the exact colours the canvas clears to (`#d9e7dd`, `#8ab45f`),
   with a fence, two shed ridges and a tower crane in silhouette. Deliberately
   the compound *from outside* — it says a site is in there and nothing about
   whose project it is. Absolute rather than fixed, so it is ground the page
   stands on instead of a band sliding over the content while scrolling.
6. `src/lib/storage/` is a JSON file store: hashed keys so nothing can climb out
   of the data directory, temp-file-and-rename writes so a crash cannot truncate
   a record, and a per-file promise queue so two tabs acknowledging at once do
   not lose one of each other's writes. `FORMAWORLD_DATA_DIR` moves it; Docker
   mounts a volume there.
7. Progress moved off `localStorage`, where a reader's level lived in one browser
   and the digest had nothing to compare against. `/api/world/progress` owns it:
   the server decides the XP and pays once per line, so a browser cannot inflate
   its own bar. Identity is the Autodesk account when the profile call answers,
   and a year-long cookie when it does not — the profile scope is opt-in through
   `APS_EXTRA_SCOPES`, because an unregistered scope fails the whole sign-in.
8. `src/world/progression/snapshot.ts` and the rewritten `away-log.ts` make the
   digest a real diff. The snapshot is entity IDs mapped to the state they were
   in — issue presentation state, asset status ID, RFI due health, form status,
   loaded members — and nothing else, so it cannot become a stale mirror of the
   project. Two rules keep it honest: a record that dropped out of the loaded
   page is never reported as a change, because a bounded feed losing a record is
   not a record changing; and a line whose records the current feeds no longer
   hold is dropped, because it could not show them. A first visit has nothing to
   diff, so the panel says "Arriving on site…" instead. The baseline is written
   on `pagehide` and unmount, not on every reconciliation — storing it each sync
   would leave the world always matching its own last record and every digest
   empty. 24 new tests across snapshot diffing, the two digest paths and the
   store, including three concurrent acknowledgements landing intact.
9. Crew appearances needed no storage after all. `personAppearance` already
   derives outfit, build and idle behaviour from the Autodesk account
   identifier, so the same person looks the same in every browser and every
   project with nothing persisted. Documented rather than reimplemented.
10. Packaged for GitHub: MIT `LICENSE` with an Autodesk trademark note, a README
    written for someone who has never seen the repository (APS app setup, the
    Custom Integrations step that silently empties the hub list if skipped, env
    table, Docker, what is and is not stored, known limits), `Dockerfile` and
    `docker-compose.yml` on Node 24 with `/data` as a volume, `.dockerignore`,
    `output: "standalone"`, and `data/` gitignored.

## Phase 30 — Several projects in one world, and two auth bugs

1. Two bugs with one cause. Seven feeds reconcile in parallel every thirty
   seconds and nothing coordinated them, so when the access token was near
   expiry all seven called the APS token endpoint with the same refresh token.
   Autodesk rotates refresh tokens: the first call won and invalidated the one
   the other six still held, they came back `invalid_grant`, and the old code
   destroyed the session on *any* refresh failure. Refreshes are single-flight
   now, keyed by the refresh token and held thirty seconds past settling so a
   handler that read the cookie just before the rotation joins the same refresh.
   Only a grant Autodesk rejected outright ends the session; a 5xx raises 503
   and leaves it alone.
2. The same parallelism explains the dead-end write prompt. APS does not always
   echo `scope` on a token response, and both the callback and the refresh
   recorded that silence as an empty scope list, so every write action showed
   "Sign in again to grant APS data:write access" — and signing in again
   produced the same empty list. An absent echo now falls back to the requested
   scopes, and `sessionMayWrite` treats an unknown set as a question for APS
   rather than a refusal. A list that is present and genuinely lacks
   `data:write` is still refused locally. Ten tests.
3. `selectedProjects` joins `selectedProject` in the session, capped at six.
   `worldProjects` reads through to the old single field, so a session saved
   before this phase is a one-project world rather than an empty one, and
   `resolveWorldProject` refuses any project ID the session did not select —
   a feed can never be talked into reading a project the reader did not choose.
4. Every feed route takes `?projectId=`, and the two write routes take it in the
   body, so an issue is created in the compound its composer was opened from
   rather than in whichever project happens to be primary.
5. The client keeps feeds *per project* and derives merged views with the same
   shapes the HUD, inspector, digest and statistics already read
   (`src/world/multi-project.ts`). That is what kept the change to roughly a
   hundred call sites from being a hundred edits: selection, relationships and
   the away digest work across compounds unchanged because entities carry their
   own `projectId`. Merging is deliberately optimistic — one compound missing a
   module must not report the whole world as broken — and the per-project alerts
   still name which project failed.
6. Each compound is measured on its own before being placed, because districts
   come from a project's own APS asset statuses and a twelve-status workflow
   needs a wider yard than a three-status one. `placeCompounds` lays them out
   row-major on a squarish grid rather than a line, which a property test holds
   to never overlapping whatever the sizes. Eleven tests.
7. Three things found by looking at it in the browser rather than by reasoning:
   - The compound name label used drei's `distanceFactor`, which is a
     perspective-camera prop. Under this scene's orthographic camera it threw
     the labels roughly 1300 world units off screen. No other `<Html>` in the
     scene uses it; the label now matches them.
   - `minZoom={12}` was tuned for one compound and could not frame three, so
     Reset view clamped and cut the top compound off. The floor now follows the
     compound count and `CameraFocus` clamps to the same number.
   - `GroundPlane` was inside `WorldScene` and would have been drawn once per
     project; it is one plane under the whole world now.
8. Camera focus carries the compound it means. Flying to a record, or to a
   digest line's district, resolves the position through that project's offset
   instead of landing on the primary project's copy of the same district.

## Phase 31 — Water that respects a neighbour, and compounds you can click

1. Open water was placed per compound and reached 24 units past its own wall,
   while `COMPOUND_GAP` is 9. With one project that was open meadow; with
   several it put lakes across a neighbour's wall and inside its districts,
   because a compound computing its own scenery cannot see the compound standing
   next door. `waterBodies` now returns only the ponds inside one wall, and
   `openWater` lays out the meadow once for the whole world: a body is kept only
   when its full radius plus the wall clearance clears *every* compound. Six
   tests, including the rule itself against a three-compound world.
2. The same fault in the scatter: the meadow ring reached 12 units past a wall.
   The per-compound scatter is now strictly inside its own wall, and `MeadowProps`
   fills the shared ground once, skipping anything within 1.2 units of any
   compound.
3. Candidates for open water were kept in scan order, which spent the whole
   quota on the first corner of a wide world and left the far side dry. They are
   collected first and ordered by seed, which spreads them and is exactly as
   deterministic as the scan it replaced.
4. Double-clicking a district on the third compound flew the camera to the first
   compound's copy of it. A district exists in every compound, so selection now
   names the project as well: `WorldScene` knows which compound it is, `Zone`
   reports it, and `focusZone` resolves the target through that compound's
   offset. The district panel is scoped the same way — opening Issues on one
   project used to list every project's issues, and its totals came from the
   merged feed.
5. A project is now a first-class thing to click, like a district.
   `CompoundPlate` is an invisible plate over each compound's footprint that
   acts only when it is the *nearest* intersection, so a cone or a crate above it
   always wins the click. One click selects the project and opens `CompoundDetail`
   — that compound's own totals, a row per district that opens it, and an honest
   note naming any module APS refused for this project. A double-click frames it.
6. The name plate was briefly a button. It hangs off the front of its compound,
   which at overview zoom puts it over the compound *behind*, so clicking one
   project's label selected another's. Found by clicking it in the browser. It
   is inert again, like every other overlay in the scene.

## Phase 32 — Measuring the world instead of guessing at it

Measured against a production build, six projects, 1600x780.

1. The first measurement was wrong and worth recording: on the dev server a
   six-project world appeared to take 40s to mount. That was Turbopack compiling
   a 4600-line component on first request plus a `waitForSelector` timeout being
   swallowed. On `next start` the same world is up in **2.0s**. Load was never
   the problem; measuring the dev server was.
2. The real cost was the overview: **40fps with six compounds in frame**, worst
   frame 33ms, against a steady 60 when zoomed into one. So the ceiling is
   how much is on screen, not how much is loaded.
3. The cause was one `useFrame` per scattered pine. Each tree subscribed its own
   per-frame callback to lean 1.3 degrees. One compound could afford a few dozen;
   six is several hundred callbacks and matrix writes every frame, for motion
   invisible at any zoom where more than one compound fits on screen. Removing it
   took the overview to **60fps and a 20ms worst frame**.
4. The shadow frustum was fixed at 34 units, which covers one compound. A world
   of six spans roughly 100, so every compound but the first was rendering with
   no shadow at all — a correctness bug found while looking for a performance
   one. It now follows the world bounds, capped at 120.
5. `/api/world/snapshot` returns all seven domains of one compound in one
   response. Seven separate reads per project meant 42 requests for a
   six-project world against a browser that opens about six connections per
   origin. It did not move the production number, because load was not the
   bottleneck, but it is the right shape and it is what keeps that true as
   projects grow. The per-domain routes stay: a write reconciles exactly one
   feed, which is what they are for.
6. Not done, and the next thing to reach for if the world grows past six
   compounds: instancing the scattered props. They are the bulk of the draw
   calls, and they are identical apart from transform and tint.

## Phase 33 — Relationship wires that reach RFIs, and a world you can hear

1. "Locate all" on a person zoomed out to nothing. It read the people and issue
   district centres off `renderPositions`, which is the *primary* compound's
   layout with no offset, so in a multi-project world it aimed at another
   project's crew camp and sized the zoom from the wrong distance. It resolves
   both districts through the owning compound now, and frames the box that holds
   them instead of guessing a zoom from the distance between two centres.
2. RFIs were missing from `buildEntityPositionMap` entirely. A wire needs a real
   position for both ends, so no relationship touching an RFI could ever be
   drawn however well APS had resolved it. They are laid out there with the same
   grid `RfiEntities` draws with, so a wire lands on the board rather than near
   it.
3. Wires were anchored only on a selected *issue*, which left an RFI, an asset
   or a form showing verified relationships in its panel with nothing drawn in
   the world to match. Any selected record anchors them now. The existing filter
   still only draws a link whose two endpoints both have a position in this
   compound, so nothing is guessed and cross-compound wires cannot appear.
4. The compound panel's district rows had the name and the count on top of each
   other. `.zone-content-list > button` sets a three-column grid for record rows
   and out-specifies a bare class, so the district name was being placed in the
   30px icon column. The rows are selected with the full path now.
5. `src/world/audio/` is the world's sound, synthesised rather than shipped: a
   brown-noise wind bed under a slow two-chord pad, plus six short interface
   tones. No audio files — a site loop and a music bed would be megabytes in the
   repository for something most readers will switch off, and oscillators cost
   nothing. Two rules: silent until asked (a work tool that makes noise on load
   is one people close), and quiet enough to leave on.
6. Restoring a saved "on" preference builds the graph into a context the browser
   has suspended, because audio cannot start before a gesture. It would have
   left a returning reader in silence until they toggled twice. The first
   pointer or key event resumes it.

## Phase 34 — A wood worth looking at, and two rivers

1. The ground between compounds was bare because the old scatter was a React
   component per prop, each owning its own geometries and materials, capped at
   140 for the whole world. It could not have gone denser without the frame
   budget going with it. `src/world/scenery/forest.ts` is the wood as flat data
   and `src/components/world/scenery.tsx` draws each species as one instanced
   mesh — eight draw calls for a few thousand plants. Same rules as the water:
   never on a compound, never in the water, deterministic.
2. Density comes from a low-frequency field rather than an even sprinkle, so the
   wood has stands and glades. A test measures that: the spread of per-cell
   counts has to be well above what a uniform scatter would give.
3. `riverCourses` cuts one or two rivers across the world. They are correct by
   construction rather than by checking afterwards: a course runs down the
   middle of a lane the compounds leave free, and its meander is clamped inside
   that lane, so it cannot reach a wall.
4. `COMPOUND_GAP` went from 9 to 15. Nine units kept compounds apart and did
   nothing else; a river needs roughly six units of clear lane after its banks,
   and a wood between two projects reads far better than a corridor of grass.
5. Four things found by looking rather than reasoning:
   - The forest filled one corner of the world and left the rest bare — the same
     scan-order-versus-quota bug the open water had. Candidates are gathered and
     thinned by position now.
   - Both rivers were laid in the open band beyond the outermost compound, which
     is always the widest lane going. Lanes that actually run *between*
     compounds are preferred now.
   - Every river was invisible. The ribbon is a flat strip whose winding depends
     on which way the course runs, and a single-sided material culled it from
     above.
   - The wood in the shadow pass cost about half the frame rate, because the
     shadow camera covers the whole world and so every instance is drawn again
     into the depth map. Nothing in the wood casts a shadow; the compounds
     still do, which is where a shadow carries meaning.
6. Measured, five projects, production build, on one machine in one sitting so
   the numbers compare: previous commit without the wood 30fps overview / 40
   zoomed; this commit with a few thousand plants and two rivers 35 / 46. The
   landscape is free. (Absolute numbers are lower than the 60 recorded in Phase
   32 because that machine was quiet; only the comparison means anything.)

## Phase 35 — The world is as big as the projects on it

1. A river stopped dead in open grass with a visible end cap. The cause was two
   numbers that had nothing to do with each other: the terrain was a fixed
   900-unit plane whatever the world contained, while the wood reached 40 units
   past the compounds and the rivers 34. Everything the scenery covered ended
   hundreds of units inside the ground it stood on.
2. One number now, `WORLD_REACH`, used by all of them. The scene's fog closes at
   104 units, so 130 is past anything that can be seen; the terrain is sized to
   the compounds plus that reach, and the wood and the rivers are planted to the
   same extent. Nothing has a visible edge because the fog closes first. A world
   with one project is a fraction of the old plane; a world with six is larger.
   Verified at full zoom-out: the landscape dissolves into haze on every side.
3. Filling that reach at the near band's density would be a hundred thousand grid
   cells for a handful of visible trees. The wood is sown in two bands instead —
   dense out to 42 units, then a wider step to the edge. That distance is where
   the fog starts closing, so a tighter grid past it would only be paying for
   haze. This is the level of detail the landscape actually needed: not loading
   on approach, but spending the budget where it shows.
4. Lakes deliberately did *not* get the longer reach. They are large, sparse
   features and scattering two dozen of them over the full extent would leave
   the middle of the world — the part anyone looks at — emptier than before.
5. Measured, five projects, production build, same machine and sitting: 33fps
   overview and 49 zoomed, against 35 / 46 for the smaller landscape and 30 / 40
   for the commit before any of it. A world several times the area costs nothing
   measurable, which is what the two-band sowing and the instancing are for.

## Phase 36 — A landscape that knows when to stop

1. The arrival digest could be dismissed and never brought back. It is the one
   panel that answers "what happened last", and closing it once removed it for
   the visit. A toolbar button re-opens it whenever there are unanswered lines,
   labelled for which digest it is — "What happened" against a stored snapshot,
   "On arrival" on a first visit. When it is genuinely empty nothing is shown,
   because nothing changed is a real answer and a panel saying so is noise.
2. Panning could take the camera clean off the world. Sizing the ground to the
   compounds fixed the *default* view but not a reader who dragged; past the
   scenery they found bare grass and then the edge of the terrain. `CameraBounds`
   clamps the controls target to the compounds plus 42 units, moving the camera
   with it so the pan stops rather than the view swinging round. The bound grows
   with the world: adding a project widens what can be reached, which is the
   limit that was asked for.
3. Two rivers, one along each axis, put a crossroads of water through the middle
   of the world. Rivers do not cross. The wider of the two lanes wins now and
   the other is left dry.
4. Open water was two dozen ponds of roughly equal size, which reads as a rash
   rather than as a landscape. One lake and at most four ponds now. The lake
   sits about 22 units from the nearest wall — a first attempt put it at the
   candidate *furthest* from every compound, which parked it at the edge of the
   reach where the fog swallowed it and the world looked as though it had no
   lake at all.

## Phase 37 — The inspector fitted to its window

The right-hand panel ran off the bottom of the screen. Its `max-height` was
measured against the viewport (`100vh - 140px`) while the panel itself hangs
98px down inside `.world-shell`, which starts below the 76px site header — so it
began at 174px and was allowed to be tall enough to end 34px past the bottom of
the window, at every window size.

A percentage resolves against the shell instead, which is the box it actually
lives in: `calc(100% - 122px)`. Measured at four window heights, the panel now
ends 24 units above the bottom edge (8 on a short window, where the page's own
`min-height` takes over) and scrolls internally once its content is longer than
that. `overscroll-behavior: contain` keeps that scroll from turning into a page
scroll at the ends.

## Phase 38 — A way out to Autodesk

1. Every record panel can now offer "Open in Autodesk". The URL is **read** off
   the record, never constructed. Deep-link patterns for Issues, Forms, RFIs and
   Assets are not publicly documented and the host differs by region, so
   assembling one would produce a link that quietly 404s for some accounts —
   worse than showing none, because a dead link in a panel that otherwise shows
   only verified data undoes the point of the panel.
2. `metadata.raw` already keeps the untouched APS record, so nothing new is
   fetched. Data Management answers with a JSON:API `links.webView`, which is
   what makes Documents work today; any module that answers the same way is
   picked up for free, and one that does not simply shows no link.
3. Three rules before a URL is offered, and the third is not cosmetic: it must
   parse, it must be `https`, and its host must be Autodesk's. These values come
   out of project data — a record whose title or custom field holds a URL must
   never become a link this application invites somebody to click. The API's own
   `links.self` is excluded too: it is a REST endpoint, and a reader sent there
   gets JSON or an auth error rather than their record. Nine tests, including
   a host that merely ends in something similar.
4. Still open: exact per-record deep links. They need one real URL per record
   type from a live ACC account to confirm the pattern and the regional host.

## Phase 39 — The left button stops doing two jobs

1. Left-drag both panned the world and selected whatever was under the pointer
   when the drag ended, so crossing the world kept opening records nobody asked
   for. Panning is a right-drag now and the left button only selects. The
   controls are told to ignore the left button by giving it an undefined action,
   which is the shape `OrbitControls` already handles.
2. `onPointerMissed` had to learn about it too. A right-drag that ends on open
   ground would otherwise read as the reader deliberately clicking nothing, and
   clear their selection every time they panned. Only button 0 clears now.
3. Escape backs out one layer at a time — the issue composer, then the digest's
   highlight, then the selection itself. Before this the only way to put the
   world back was to find a patch of empty ground and click it. The handler is a
   plain effect over the two pieces of state it reads; a first version drove it
   from inside `setIssueComposer`'s updater, which is a side effect in a place
   React is free to run twice.
4. The hint bar says `Right-drag pan` and `Esc deselect`, because a control
   scheme nobody can discover is not an improvement.
5. Verified in the browser: a left-drag across the world moves it 0px, the same
   drag on the right button moves it 421px, and Escape closes an open panel and
   leaves it closed when pressed again.

## Phase 40 — Controls you can look up

1. The controls were a strip of four hints that faded out ten seconds after
   arrival and could never be brought back: fine for the reader who happened to
   be looking, useless for the one who was not, and no help at all now that the
   mouse buttons have changed meaning. `src/components/world/world-help.tsx`
   is the same information as a panel that can be opened, closed, and left
   closed.
2. It opens by itself on a first visit and never again — closing it is
   remembered in `localStorage`, so somebody who knows the controls is not shown
   them daily. The `?` button in the top bar and the `?` key both bring it back.
   The key handler ignores typing in an input, so it cannot fire while somebody
   is writing an issue title.
3. `useState(() => …)` rather than opening it from an effect: the whole canvas is
   loaded with `ssr: false`, so there is no server render to disagree with, and
   the lint rule against setting state in an effect body is right to complain.
4. The faded strip and everything it needed — `hasInteracted`,
   `InteractionWatcher`, five CSS rules and a keyframe — are gone rather than
   left sitting next to their replacement.
5. Removing those rules by regular expression ate a closing brace of a media
   query and broke the build. Reverted and redone with exact-line matches, then
   checked by counting braces across the file before rebuilding.
6. Verified in the browser: shown on a first visit with all six rows, hidden and
   remembered on close, still hidden after a reload, and brought back by both
   the button and the key.
