# FormaWorld — product contract

## Formål

FormaWorld er en levende 3D-repræsentation af et virkeligt Autodesk Forma-projekt.
Brugeren skal kunne forstå og følge projektet ved at se på verdenen i stedet for
at være afhængig af et traditionelt dashboard.

Autodesk Forma / APS er altid source of truth. FormaWorld må ikke opfinde
forretningsdata, personer, statusser, relationer eller succesfulde handlinger.

## Repræsentation

- Én virkelig person repræsenteres af én individuel NPC. Ti projektbrugere skal
  derfor kunne ses som ti forskellige, valgbare personer med deres egne data.
- A crew figure's appearance is derived deterministically from the person's
  account-level identifier — the Autodesk id, or the email when no id is
  returned — and never from the project membership record or a random seed. The
  same person must therefore be recognisably the same crew member in every
  project world. An identity that only exists per project is treated as
  unstable and marked as such rather than being presented as portable.
- Ét vist issue, RFI, asset, dokument eller form repræsenterer én bestemt
  APS-record og skal kunne spores tilbage til dens eksterne ID.
- A collection endpoint that reports records in its pagination total must never
  render an empty district. APS services disagree on which payload property
  holds the page, so the property that was read is logged on every load and a
  wrong guess shows up in the server log instead of as missing data.
- Store samlinger må begrænses af hensyn til overblik og performance. Verdenen
  skal i så fald tydeligt vise både den virkelige total og hvor mange objekter der
  aktuelt er repræsenteret.
- A display limit must not be so low that it hides most of a project. Collections
  are paged up to a bounded limit rather than read as a single small page: one
  page of assets hid most of a real project's assets and, with them, most of the
  variety in its yard.
- Dekorative objekter må ikke kunne forveksles med rigtige projekt-entities.
- Placering i verdenen er symbolsk, medmindre APS faktisk leverer en fysisk
  placering. UI'et må aldrig antyde live GPS-positioner, som kilden ikke har.

## Levende projektadfærd

Projektets autoritative tilstand skal drive verdenens adfærd:

```text
Forma / APS-status ændres
        ↓
Data hentes og normaliseres
        ↓
Entity skifter afledt zone eller visuel tilstand
        ↓
Verdenen animerer ændringen
```

Eksempler:

- Et asset, der skifter fra `Pending` til `In Progress`, flyttes symbolsk fra
  lageret til produktionsområdet.
- Et asset, der bliver leveringsklart, flyttes til Loading Bay.
- Et nyt eller genåbnet issue bliver synligt i Issue Area.
- Et lukket issue ændrer visuel tilstand og kan senere flyttes til et afsluttet
  område, hvis projektets konfiguration definerer det.
- En ændret assignee skal kunne ses på issue-person-relationen.

Animation er altid en reaktion på verificeret kildedata. Animation eller drag
må aldrig alene blive ny forretningsstatus i Forma.

## Verdenens geografi

- Verdenen skal opleves som en sammenhængende, udforskbar projektverden og ikke
  som dashboard-kort placeret på en grå flade.
- The world is one walled compound standing on a single continuous green ground
  plane. Districts rest directly on the ground; floating platforms, abstract
  plinths and CAD grids are not part of the visual language.
- The enclosure — wall runs, corner towers and gates — is derived from the
  district footprints it must contain, so a district that grows with live
  content or is moved in Edit layout can never end up outside the city.
- The world is a construction site. The district metaphor lives in geometry
  only — never in text. Labels use strict Autodesk terminology: Project,
  Documents, Issues, RFIs, Forms, Project Members, and one "Assets: <status>"
  district per asset status. A user must be able to read a label and know
  exactly which APS data they are looking at.
- The core districts are identical in every project world. Assets have one
  district — the Material Yard — holding the whole workflow, read left to right:
  material arrives at the intake end, waits in the lane for whichever APS status
  it currently holds, and leaves from the dispatch end. Lane order is the
  project's own APS status order, so a status change moves an asset one lane
  along the same yard instead of to another district. An asset whose status is
  outside the project's set gets its own clearly named lane rather than being
  filed under an unrelated status.
- One district per status is a defect, not a feature: a grid of near-identical
  fenced districts reads as a dashboard, and repeated equipment in each of them
  is noise. Equipment appears once, at the ends of the one yard.
- Districts carry no name in the world. A permanent name floating over every
  district is visual noise; the name is shown when the district is selected.
- Roads never run onto a district. A road stops at the kerb, and shared stretches
  are drawn once so the network reads as roads rather than as loose patches.
- The village plan is fixed and identical in every project world. There is no
  edit mode, no per-project layout storage and no content-driven growth: a
  district is always the same size in the same place, so a person who knows one
  project world already knows every other one.
- Structures are built from combined primitives — a footing, a body and a
  pitched roof or a steel portal frame — never plain boxes. Nothing stands on a
  white, floating or extruded platform: every structure, entity and prop rests
  directly on the district ground, the dirt path or the grass.
- Not every district is an enclosed building. Working districts use open
  structures — steel frames, canopies, conveyors, loading decks — so their
  contents stay visible from the default camera.
- Built surfaces must read against the ground they stand on. District ground is
  earth or asphalt, so structures and entities use painted steel, white
  panelling and pale timber; a brown structure on brown dirt is a defect.
- Structures stand at the back of a district and the entity lane runs across its
  front, so live records are never hidden behind scenery.
- Status kan flytte en entity mellem distrikter eller mellem underområder i et
  distrikt. I Issue Garden står eksempelvis åbne, forfaldne, besvarede og
  lukkede issues i forskellige bede.
- Visuelle temaer og miljøobjekter må skabe spilfølelse, men må ikke ligne ekstra
  projekt-records. Ti synlige personer betyder ti virkelige projektbrugere.
- The in-world product UI is English-only. Labels, actions, loading states,
  details, errors, and navigation must never mix languages.
- The visual system uses ground-level isometric districts with consistent
  materials, spacing, shadows, labels, and reserved entity lanes.
- Entities wear the metaphor of their district: an asset is a stack of
  construction material, an issue is a traffic cone standing on asphalt, a
  document is a drawing set or archive folder, and a form is an inspection
  totem. An issue cone's colour is its authoritative APS state and nothing else:
  red open, deep red overdue, yellow answered, green closed, grey uninterpreted.
- Every selectable entity carries one click target covering the whole grouped
  object, matched to that object's own silhouette. An oversized target sits in
  front of the records behind it and swallows their hover, which is a defect —
  entity grids are spaced so no two click targets overlap.
- The material is the subject of the yard, not the steelwork. Stacks are drawn
  large enough to read at the default camera distance; equipment is kept small
  and appears once.
- The physical form and colour of a material stack come from the asset's APS
  category where the project populates one: two assets in a category always look
  alike and two categories never do. Many projects never populate the categories
  API, and a single neutral fallback there turned every yard into an identical
  grey grid. The fallback therefore hashes what the record itself carries — its
  own category text, else its title — into the same palette. It stays
  deterministic and stable per record; it simply does not depend on an endpoint
  the project may not use. Whether a look came from a resolved category is
  tracked, so the world never claims a categorisation it does not have.
- Like material stands together inside a lane, ordered by the project's own
  category order where it exists.
- District footprints stay fixed, but the markings inside a district size
  themselves to the records loaded. An issue bay grows with its state's count
  and never lets a cone stand outside its painted box.
- Scenery is limited to natural features and recognisable site equipment: trees,
  bushes, rocks, a wheelbarrow, plant, barriers and site huts. Anonymous small
  boxes are not scenery — a featureless object standing on the ground is too easy
  to mistake for a project record.
- Set dressing opts out of raycasting entirely. A prop must never intercept a
  click meant for a project record, and a click that lands on one falls through
  to the district underneath.
- Scenery stands in reserved space, never over live records: the yard crane
  parks in the one bay slot the issue states do not use, and camp props stand
  clear of the crew lane.
- The world carries water — ponds inside the walls and open water in the meadow
  around them — placed from the compound's own geometry so it can never cover a
  district, a road or the wall, and never collects a scattered prop. Shorelines
  are irregular, not circles, and every outline point stays inside the radius the
  placement rules cleared.
- Water is still. Nothing decorative animates in a way that competes with the
  project data, which is the only thing in this world whose movement means
  something.
- The world must read as open country, not as a tile. The terrain runs far past
  the point the camera can reach, the fog colour matches the background exactly,
  and the orthographic clip range is symmetric so nothing between the camera and
  the horizon is cut away. No edge may be visible at any zoom or aspect ratio —
  neither where the ground runs out nor where the camera clips it.
- Districts keep open ground between themselves and the wall. A wall crowding a
  district makes the world read as a cramped diagram rather than a place.
- No district emits a light column or beam. An overview marker that shoots out of
  the world reads as a rendering fault, not as a wayfinding aid.
- Scenery and live entities must occupy separate deterministic areas. Visible
  intersections, overlapping labels, and random stacking are release blockers.
- UI quality is part of functionality: the HUD must feel like a coherent game
  interface, not a collection of dashboard cards placed over a canvas.
- Districts must communicate their domain through distinct architecture and
  restrained ambient life: the warehouse may emit chimney smoke, production may
  run a conveyor, loading may use a forklift, the Issue Garden may contain beds
  and a fountain, and Forms may use checkpoint/scanner motifs. These are scenery
  cues only and never claims about APS operational state.
- Ambient scenery must remain behind reserved entity lanes and must not block
  selection. Trees may sway and machines may loop continuously, but only real
  loaded project members are rendered as people. Their walking, working, and
  carrying motions are symbolic presentation state unless APS activity proves a
  specific cross-district action.
- A normal click inspects a district or entity. A double-click on a district
  smoothly centers and zooms the camera into that world; manual pan and zoom
  remain available afterward.
- Flat dirt paths connect the central Project Keep to every other district and
  to each gate. They are civic layout only: they are re-derived from the current
  district centres on every layout change, so they can neither collide after
  editing nor imply a relationship between two districts. A verified APS
  relationship is still shown exclusively as an on-demand wire.

## Relationships og realtime

- Dokumenterede APS-relationships er en central del af verdenen og skal
  kunne følges begge veje, eksempelvis Issue ↔ Asset, Issue ↔ Form,
  Issue ↔ Person, Issue ↔ RFI og Asset ↔ Document.
- Relationships må kun oprettes, når APS-data beviser dem. Matchende navne er
  ikke tilstrækkeligt.
- Resolved relationships are drawn only while a real Issue is selected. Its
  proven links to loaded entities appear as clear blue animated wires. The
  animation is bidirectional, read-only, capped to avoid visual noise, and must
  disappear when the Issue is deselected or either endpoint cannot be proven.
- A Person inspector may offer `Locate all` when one or more loaded Issues have
  verified relationships to that person. This explicit action temporarily draws
  only those Person-to-Issue wires and frames both districts; merely selecting a
  Person must not show wires.
- Inspecting or focusing a district opens a contents panel with real loaded
  records, honest totals when available, and navigation to individual entities.
- The panel must agree with the ground. It groups records the way the world lays
  them out — assets by the project's own APS status order, matching the yard
  lanes; issues by bay order — so a heading in the list points at a place the
  reader can find.
- A record's icon is drawn from the same data as its 3D object: an asset shows
  its material form and category colour, an issue shows a traffic cone in its APS
  state colour, and a project member shows their own vest and helmet from
  `personAppearance`. A generic lettered badge is a defect: it tells the reader
  nothing and breaks the link between the panel and the world.
- Valg af en entity skal fremhæve dens relaterede entities og give
  mulighed for at navigere til dem på tværs af distrikter.
- Verdenen skal holdes ajour via passende APS-webhooks, kontrolleret polling og
  reconciliation. Realtime betyder, at en autoritativ ændring bliver synlig
  uden manuel dashboard-kontrol—ikke at klienten gætter en ny state.
- En statusændring skal kunne udløse en tydelig bevægelse eller animation til
  det nye autoritative område uden at animationen bliver source of truth.
- Compound paths are scenery, never data. Verified relationships are visualized
  on demand as temporary wires, never inferred from geography or from which
  districts a path happens to touch. A person may only
  leave Project Village as a work animation when an APS snapshot proves relevant
  activity or assignment; returning never writes business state.
- Activity-loggen må kun navngive den handling, som kildedata beviser. En ændret
  `updatedAt` er en generel opdatering, ikke automatisk en kommentar.

## Interaktion

- Alle rigtige entities skal kunne vælges og vise deres faktiske Forma-data.
- Brugeren skal senere kunne følge dokumenterede relationer mellem personer,
  issues, assets, dokumenter og forms direkte i verdenen.
- En handling, som ændrer Forma, kræver eksplicit bekræftelse og må først vises
  som gennemført, når APS har accepteret ændringen.
- Neither entities nor districts can be dragged. World-actions must be explicit,
  contextual actions with confirmation and APS write-back.
- Phase 10 write-back uses one shared interaction contract for live Assets,
  Issues, and Forms. The server reloads the selected APS record and its current
  allowed/project-defined choices before every mutation. The browser never sends
  an arbitrary APS path or treats an optimistic state as authoritative.
- Asset and Issue status changes, plus Form submission, require a review step.
  Success is shown only after APS accepts the mutation and the affected feed has
  been reconciled. People and Documents remain read-only until a documented,
  product-meaningful action is implemented.

## Spillelaget

Verdenen må gerne føles som et spil, men spillaget må aldrig påstå noget om
projektet, som APS ikke har sagt.

- En deadline vises som en health bar. Baren tegnes kun for records, der har en
  rigtig `dueDate` fra APS — en tom bar ville hævde, at verdenen kender en frist,
  den ikke har. Grøn over syv dage, gul under syv dage, rød og blinkende når
  datoen er passeret.
- Alle records med en `dueDate` viser deres bar — også de grønne. En zone skal
  kunne aflæses som helhed, ikke kun som sine problemer. Det er derfor den
  ambiente chip er lille og tekstløs (en bar på en mørk plade); den fulde
  aflæsning med dage hører til det ene objekt, markøren peger på. Et overskredet
  record ryger derudover i brand i 3D, så en zone i problemer kan aflæses fra
  oversigtszoomet.
- Alle HTML-overlays i scenen er inerte for markøren. Et overlay, der stjæler
  hover eller klik fra objektet under det, er en defekt.
- XP og niveau tilhører læseren, ikke projektet. De gemmes pr. projekt og må
  aldrig fremstilles som projektdata eller blandes ind i tællinger fra APS.
- En linje i digestet er en påstand og skal kunne bevise sig selv. Hver linje
  bærer de records, den taler om, og et klik viser dem: kameraet flyver til
  distriktet, de præcise objekter får en fremhævningsring i verdenen, og
  inspektøren indsnævres til netop dem med en vej tilbage til hele distriktet.
  En linje, man kun kan kvittere for, er en defekt.
- Fremhævningsringen er visuelt adskilt fra markeringsringen. Ét record kan være
  valgt, mens en hel gruppe vises; de to må ikke ligne hinanden.
- "While you were away" is a real diff, not a restatement of the present. APS
  exposes no event stream this app can read, so the world keeps its own: the
  snapshot a visit ends on is stored per reader and per project, and the next
  arrival is compared against it. A line therefore claims a transition between
  two observations that actually happened. A record that has left the loaded
  page is never reported as a change — a bounded feed dropping a record is not
  the record changing. On a genuine first visit there is nothing to diff, so the
  panel renames itself to "Arriving on site…" and describes the state being
  walked into rather than passing it off as news.
- Saved reader state is the reader's, never the project's. XP, answered digest
  lines and the visit snapshot live on the server keyed by reader and project.
  The snapshot holds entity IDs and the state they were in — never titles,
  names or dates. XP is granted server-side, once per line, so a browser cannot
  award itself a level.
- Værktøjslinjen nederst handler om hele verdenen; inspektøren til højre handler
  om ét record. "Create issue" derfra åbner den samme rigtige APS-write-back som
  fra et record, ikke en attrap.

## Kontrolspørgsmål for hver fase

En fase er kun produktmæssigt vellykket, hvis svarene er tydelige:

1. Hvilke virkelige Forma-records repræsenteres?
2. Kan hvert vist objekt spores til sin APS-record?
3. Er total, visningsgrænse og eventuel filtrering ærlig?
4. Hvilken APS-tilstand bestemmer objektets zone og udseende?
5. Hvordan bliver en ændring i Forma synlig i verdenen?
6. Kan dekorativ og autoritativ state skelnes klart?
7. Er alle write-actions eksplicitte, bekræftede og reconcilet mod APS?

## Reconciliation cadence

- The active world reconciles every 30 seconds and backs off to 120 seconds in a
  hidden browser tab.
- Visibility and connectivity restoration trigger an immediate refresh.
- Concurrent triggers share one in-flight reconciliation so repeated snapshots
  cannot create duplicate activity.
- A transient APS failure is not a reason to empty a district. Gateway errors
  (408/425/429/5xx) are retried once with a bounded timeout, and a request that
  keeps failing falls back to a smaller page before giving up — fewer records is
  better than none. A district that already held real records keeps showing them
  and is marked stale, with the alert saying the data was not refreshed. A
  permission or authentication failure is never retried and never disguised.
- Webhook delivery must not be claimed before supported APS events and a shared
  deployment transport have been configured and verified.

Denne kontrakt gælder for alle kommende implementeringsfaser.
