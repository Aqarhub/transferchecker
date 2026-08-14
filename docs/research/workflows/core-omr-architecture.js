export const meta = {
  name: 'core-omr-architecture',
  description: 'Independent architectures for the OMR scanning engine, judged and synthesised',
  phases: [
    { title: 'Ground', detail: 'read the repo and the plan, establish shared facts' },
    { title: 'Design', detail: 'four independent architectures from different angles' },
    { title: 'Judge', detail: 'three lenses score every design' },
    { title: 'Synthesise', detail: 'one design to build, with its risks' },
  ],
};

const REPO = `/home/user/transferchecker`;

const READ_FIRST = `
You are designing packages/core-omr for an Arabic-first OMR exam grading product.

READ THESE FIRST, they are the ground truth:
- ${REPO}/docs/PLAN.md section 4 (the scanning engine pipeline and its non-negotiable rules),
  section 0 (MVP scope), section 11 (acceptance criteria, especially 1, 8, 9)
- ${REPO}/docs/SHEET-SPEC-V3.md (the sheet model)
- ${REPO}/packages/sheet-spec/src/index.ts (everything core-omr can already rely on)
- ${REPO}/packages/sheet-spec/src/types.ts (SheetLayout, BubbleGroup, Bubble, GridFieldLayout)
- ${REPO}/packages/sheet-spec/src/groups.ts (bubbleGroups)
- ${REPO}/packages/sheet-spec/src/code/decode.ts (the printed code carries the WHOLE geometry)
- ${REPO}/packages/sheet-spec/src/paper.ts (GEOMETRY: fiducials, timing marks)
- ${REPO}/docs/CODING-STANDARDS.md
- ${REPO}/docs/DEVLOG.md (the top few entries, for decisions already made)

FACTS YOU MUST NOT CONTRADICT:
1. sheet-spec is a pure TypeScript package. layoutSheet(spec) gives every bubble centre and
   radius in millimetres. The printed code decodes back to a full SheetSpec, so a device that
   never saw the template can rebuild the exact geometry.
2. The plan states core-omr is "TypeScript خالص، صفر تبعيات، مُختبَر بالكامل": pure TypeScript,
   zero dependencies, fully tested, and it must know nothing about React or the camera. It is
   tested in CI on static images from a folder, with no phone.
3. But the plan's pipeline sketch names OpenCV operations (adaptiveThreshold, findContours,
   getPerspectiveTransform) which on mobile would come from react-native-fast-opencv.
   RESOLVING THIS TENSION IS THE CENTRAL DESIGN QUESTION. Note the sheet has four large
   solid 8mm corner squares at known millimetre positions and timing marks down one edge,
   which is far more structure than a general document scanner has.
4. Non-negotiable rules already decided: relative threshold within a question not absolute;
   never guess, an ambiguous read is surfaced; every bubble returns a fill RATIO not a boolean
   and a bubble in the grey band is marked uncertain; the same paper photographed twice must
   give the same result (acceptance criterion 8); a question with select:'many' legitimately
   has several filled bubbles and that is not ambiguity; a missing student id is "unset" and
   never silently zero.
5. Target: 99.7% accuracy on a golden set of 300+ real photographs, enforced in CI.
6. Deployment targets: React Native (Hermes) on phones, and Node in CI. Whatever you propose
   must run in both. Hermes has no WASM by default and limited typed array performance.
`;

const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'angle',
    'cvDecision',
    'packageLayout',
    'pipeline',
    'determinism',
    'confidence',
    'testStrategy',
    'risks',
    'firstMilestone',
  ],
  properties: {
    name: { type: 'string' },
    angle: { type: 'string', description: 'the priority this design optimises for, one sentence' },
    cvDecision: {
      type: 'object',
      additionalProperties: false,
      required: ['choice', 'rationale', 'rejected'],
      properties: {
        choice: { type: 'string', description: 'how the CV primitives are obtained' },
        rationale: { type: 'string' },
        rejected: { type: 'string', description: 'the alternative rejected and why' },
      },
    },
    packageLayout: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'purpose', 'approxLines'],
        properties: {
          path: { type: 'string' },
          purpose: { type: 'string' },
          approxLines: { type: 'number' },
        },
      },
    },
    pipeline: {
      type: 'array',
      maxItems: 15,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stage', 'input', 'output', 'howItWorks', 'failureMode'],
        properties: {
          stage: { type: 'string' },
          input: { type: 'string' },
          output: { type: 'string' },
          howItWorks: { type: 'string', description: 'the actual algorithm, concretely' },
          failureMode: { type: 'string', description: 'what it does when it cannot succeed' },
        },
      },
    },
    determinism: {
      type: 'string',
      description: 'how two photographs of one paper give one answer',
    },
    confidence: { type: 'string', description: 'the fill ratio and uncertainty model, concretely' },
    testStrategy: {
      type: 'string',
      description:
        'how this is tested without a phone, and how the golden set is built before real photographs exist',
    },
    risks: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['risk', 'mitigation'],
        properties: { risk: { type: 'string' }, mitigation: { type: 'string' } },
      },
    },
    firstMilestone: {
      type: 'string',
      description: 'the smallest thing to build first that proves the design',
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['designName', 'lens', 'score', 'strongest', 'fatalFlaw', 'verdict'],
  properties: {
    designName: { type: 'string' },
    lens: { type: 'string' },
    score: { type: 'number', description: '0 to 10' },
    strongest: { type: 'string' },
    fatalFlaw: { type: 'string', description: 'the worst problem, or "none found" ' },
    verdict: { type: 'string' },
  },
};

phase('Ground');
const ground = await agent(
  `${READ_FIRST}

Do not design anything yet. Report the ground facts a designer needs, from the actual files:
- the exact exports of sheet-spec that core-omr can build on, with their shapes
- the exact GEOMETRY constants that matter to a scanner (fiducial size and positions, timing
  mark size and positions, page sizes)
- what bubbleGroups returns and what it assumes
- what the printed code decodes to
- the exact non-negotiable rules from PLAN.md section 4, quoted
- anything in the repo that contradicts the plan
Be concrete and quote real identifiers and numbers. This is handed to four designers.`,
  { label: 'ground-truth', phase: 'Ground' },
);

phase('Design');
const ANGLES = [
  {
    key: 'purity',
    brief: `Optimise for the plan's literal words: ZERO runtime dependencies, pure TypeScript,
      everything implemented in this package including any image processing. Argue concretely
      that the sheet's known structure (four solid corner squares at known mm positions, timing
      marks) makes general purpose contour finding unnecessary. Give the actual algorithms you
      would write: how you locate four squares in a photograph without OpenCV, how you solve
      and apply a perspective transform, how you sample a bubble. Be honest about performance
      on Hermes and about what you would lose.`,
  },
  {
    key: 'ports',
    brief: `Optimise for portability and honesty about what is hard. Define a narrow port
      interface for the few primitives that genuinely benefit from native code, and implement
      pure TypeScript fallbacks so CI and Node need no native anything. The algorithm and all
      the decisions live in this package; only the pixel crunching is swappable. Specify the
      port interface exactly, method by method, and justify every method that is in it.`,
  },
  {
    key: 'accuracy',
    brief: `Optimise for the 99.7% number and for acceptance criterion 8 (two photographs of one
      paper give the same result). Work backwards from the failure modes of real classroom
      photographs: shadow across the page, a fold, a phone at an angle, an eraser smudge, a
      light pencil, a bubble outline printed too dark. For each, say what in the pipeline
      defends against it. Design the confidence model in detail, including exactly where the
      uncertain band sits and how it was chosen. Be specific about what makes a read
      reproducible rather than merely correct on average.`,
  },
  {
    key: 'testability',
    brief: `Optimise for being able to prove the thing works before any real photograph exists.
      The golden set needs 300+ real photographs which we do not have and cannot get today.
      Design so that development is not blocked: synthetic image generation from our own PDF
      renderer, controlled degradation (perspective, blur, shadow, noise, ink variation),
      property based tests, and a clear path from synthetic to real. Say exactly what the first
      test looks like and what it asserts.`,
  },
];

const designs = (
  await parallel(
    ANGLES.map(
      (a) => () =>
        agent(
          `${READ_FIRST}

GROUND FACTS gathered from the repo by another agent:
${ground}

YOUR ANGLE: ${a.brief}

Design packages/core-omr completely from this angle. Be concrete: real file paths, real
function signatures, real algorithms with the actual mathematics, real numbers. A vague
design scores zero. Where you make a trade, name what you gave up.`,
          { label: `design:${a.key}`, phase: 'Design', schema: DESIGN_SCHEMA, effort: 'high' },
        ),
    ),
  )
).filter(Boolean);

log(`${designs.length} designs to judge`);

phase('Judge');
const LENSES = [
  'accuracy and reproducibility on real classroom photographs, and whether the 99.7% target is credible under this design',
  'portability: does this actually run on Hermes in React Native AND in Node CI, and what breaks first',
  'buildability and testability: can this be built and proven starting today with no phone and no real photographs, and is the code small enough to maintain',
];

const verdicts = (
  await parallel(
    designs.flatMap((design) =>
      LENSES.map(
        (lens) => () =>
          agent(
            `${READ_FIRST}

Judge this proposed design for packages/core-omr through ONE lens only.

LENS: ${lens}

DESIGN:
${JSON.stringify(design, null, 2)}

Be adversarial. Look for the flaw that would only show up after the code is written. Score
0 to 10 through your lens alone, and name the single worst problem. If you find nothing
fatal say "none found" rather than inventing something.`,
            {
              label: `judge:${design.name}`,
              phase: 'Judge',
              schema: VERDICT_SCHEMA,
              effort: 'high',
            },
          ),
      ),
    ),
  )
).filter(Boolean);

phase('Synthesise');
const final = await agent(
  `${READ_FIRST}

GROUND FACTS:
${ground}

FOUR DESIGNS:
${JSON.stringify(designs, null, 2)}

JUDGEMENTS (three lenses each):
${JSON.stringify(verdicts, null, 2)}

Produce THE design to build. Do not pick a winner wholesale: take the strongest spine and
graft the best parts of the others onto it, and drop anything a judge found fatal.

Write it as a decision document in the style of ${REPO}/docs/SHEET-SPEC-V3.md: numbered
decisions, each with its rationale and the alternative that was rejected and why. Include:
- the resolved answer to the OpenCV tension, stated as a decision with its cost
- the exact file layout with a purpose and rough size for each file
- every pipeline stage with its real algorithm and its failure mode
- the confidence model with its actual numbers and where they came from
- how determinism is achieved and how it is tested
- how the golden set is bootstrapped before real photographs exist
- the first milestone, small enough to finish and prove
- the open questions that genuinely need the product owner, if any

Be concrete enough that someone could start typing. English prose. No em dashes anywhere.`,
  { label: 'synthesis', phase: 'Synthesise', effort: 'max' },
);

return { ground, designs, verdicts, final };
