/**
 * The world, seen from outside its wall.
 *
 * The pages before sign-in used to be a different product from the thing behind
 * them: flat paper, no ground, no light. This puts the reader on the same site —
 * the sky and grass are the exact colours the 3D scene clears to (`#d9e7dd` and
 * `#8ab45f`), so walking into `/world` is a continuation rather than a jump.
 *
 * It shows the compound from the outside on purpose. A fence, the ridge of two
 * sheds, a tower crane over the wall: enough to say there is a site in there,
 * and nothing about whose project it is or what is standing in it. The world's
 * own contents are earned by signing in, not previewed on a landing page.
 *
 * Purely decorative, so it is inert to the pointer and hidden from assistive
 * technology.
 */
export function WorldHorizon() {
  return (
    <div className="world-horizon" aria-hidden="true">
      <svg viewBox="0 0 1440 260" preserveAspectRatio="xMidYMax meet" role="presentation">
        {/* Far treeline: the horizon the scene's fog dissolves into. Rounded
            scrub with the occasional pine, which is what the world scatters. */}
        <g className="horizon-far">
          <path d="M0 152 q42-24 78 0 q32-26 66-2 q36-22 64 2 q46-26 86 2 q38-22 72 2 q42-24 78 4 q36-20 66 2 q48-26 90 2 q40-20 74 4 q44-24 82 2 q38-18 70 4 q42-22 78 2 q36-16 62 6 v92 H0Z" />
          <path d="M150 152 l26-46 26 46Z" />
          <path d="M470 154 l22-40 22 40Z" />
          <path d="M760 150 l28-50 28 50Z" />
          <path d="M1330 154 l24-44 24 44Z" />
        </g>

        {/* Inside the compound: two shed ridges, a container, and a tower crane. */}
        <g className="horizon-mid">
          <path d="M232 178 v-30 l58-32 58 32 v30Z" />
          <path d="M612 178 v-24 h96 v24Z" />
          <path d="M906 178 v-34 l52-28 52 28 v34Z" />

          {/* Tower crane. Mast, counterweight, jib, trolley line and hook. */}
          <rect x="1178" y="66" width="11" height="112" />
          <rect x="1120" y="56" width="30" height="24" />
          <rect x="1120" y="68" width="200" height="9" />
          <rect x="1166" y="77" width="24" height="17" />
          <rect x="1288" y="77" width="5" height="42" />
          <rect x="1280" y="119" width="21" height="9" />
          {/* A-frame and tie bars, the shape that makes it a crane at a glance. */}
          <path d="M1179 66 l5-24 5 24Z" />
          <path d="M1182 44 l138 22 -2 6 -138-22Z" />
          <path d="M1186 44 l-52 12 2 6 52-12Z" />
        </g>

        {/* The wall the world is enclosed by, read here as a site fence. */}
        <g className="horizon-fence">
          <rect x="0" y="170" width="1440" height="7" />
          <rect x="0" y="188" width="1440" height="7" />
          {Array.from({ length: 45 }, (_, index) => (
            <rect key={index} x={index * 32 + 6} y="160" width="9" height="46" />
          ))}
        </g>

        <g className="horizon-ground">
          <rect x="0" y="202" width="1440" height="58" />
        </g>
      </svg>
    </div>
  );
}
