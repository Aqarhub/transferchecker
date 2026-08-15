export const meta = {
  name: 'omr-failure-modes',
  description: 'What teachers and institutions actually complain about in OMR, and the defences',
  phases: [
    { title: 'Sweep', detail: 'five source angles researched in parallel' },
    { title: 'Defend', detail: 'each finding set turned into concrete requirements' },
    { title: 'Critic', detail: 'what modality was missed' },
    { title: 'Write', detail: 'a plan section in Arabic' },
  ],
};

const REPO = `/home/user/transferchecker`;

const CONTEXT = `
TransferChecker is an Arabic-first OMR exam grading product: a teacher prints an answer sheet,
students shade bubbles, and the teacher photographs the papers with a phone (and later, for
institutions, feeds them through a document scanner) to get grades.

READ THESE FIRST so your findings land on the real design:
- ${REPO}/docs/PLAN.md section 4, the scanning engine pipeline and its non-negotiable rules
- ${REPO}/docs/PLAN.md section 11, the acceptance criteria
- ${REPO}/docs/COMPETITIVE-NOTES.md section 5, what we observed in a competitor's real app,
  including finding 49 where the same paper scanned twice gave two different scores
- ${REPO}/packages/sheet-spec/src/paper.ts, the physical sheet: four solid 8mm corner squares,
  timing marks down one edge, a printed code carrying the whole geometry
- ${REPO}/packages/sheet-spec/src/spec.ts, bubble metrics and the three label placements

WHAT WE ALREADY DECIDED, so you can tell us what we missed rather than repeat us:
- The fill threshold is relative within a question, never absolute, to survive shadow.
- Two shaded bubbles or a weak shading is "ambiguous": it stops and is shown to the teacher.
  We never guess. A question marked select:'many' is the deliberate exception.
- Every bubble returns a fill RATIO, not a boolean, and a bubble in the grey band is flagged
  uncertain rather than decided silently.
- A scan is accepted only when three consecutive frames agree.
- The same paper photographed twice must give the same result. This is acceptance criterion 8.
- Rescanning a paper already on file must offer replace rather than silently duplicate.
- A blank student id grid is "unset", never zero.
- The sheet prints a warning: print at 100% scale, do not use fit to page.
- Images are never uploaded or stored. All processing happens on the device.

Today is 14 August 2026. USE WEB SEARCH. We want what real users actually say, not what an
assistant recalls. Cite the URL for every claim of fact. Where you cannot find a source, say
you are reasoning rather than citing, and mark it clearly.
`;

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['angle', 'findings', 'sourcesUsed', 'searchesThatFoundNothing'],
  properties: {
    angle: { type: 'string' },
    findings: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['complaint', 'whoSaysIt', 'source', 'howOften', 'rootCause', 'evidenceKind'],
        properties: {
          complaint: {
            type: 'string',
            description: 'the problem in the words a teacher would use',
          },
          whoSaysIt: {
            type: 'string',
            description: 'teachers, students, institutions, vendors, researchers',
          },
          source: { type: 'string', description: 'URL, or "reasoning, not cited" ' },
          howOften: {
            type: 'string',
            description: 'how common this appears to be, and on what basis',
          },
          rootCause: {
            type: 'string',
            description: 'the technical or human cause underneath the complaint',
          },
          evidenceKind: { type: 'string', enum: ['cited', 'inferred'] },
        },
      },
    },
    sourcesUsed: { type: 'array', maxItems: 25, items: { type: 'string' } },
    searchesThatFoundNothing: {
      type: 'string',
      description: 'what you looked for and could not find, so the gap is visible',
    },
  },
};

const DEFENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['angle', 'requirements', 'alreadyCovered', 'cannotDefend'],
  properties: {
    angle: { type: 'string' },
    requirements: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['complaint', 'defence', 'where', 'testable', 'priority'],
        properties: {
          complaint: { type: 'string' },
          defence: {
            type: 'string',
            description: 'the concrete mechanism, with numbers where they exist',
          },
          where: {
            type: 'string',
            description: 'sheet design, scanner pipeline, interface, or process',
          },
          testable: { type: 'string', description: 'how we would prove it works, concretely' },
          priority: { type: 'string', enum: ['mvp', 'after-mvp', 'watch'] },
        },
      },
    },
    alreadyCovered: {
      type: 'string',
      description: 'which complaints our existing decisions already answer, named',
    },
    cannotDefend: {
      type: 'string',
      description: 'what no software can fix, and what we do about it anyway',
    },
  },
};

phase('Sweep');
const ANGLES = [
  {
    key: 'voices',
    brief: `What teachers and schools actually say. Search app store and Play store reviews of
      ZipGrade, GradeCam, Akindi, Remark Office OMR, ExamReader, and similar; teacher forums and
      subreddits such as r/Teachers and r/edtech; school IT community posts; vendor support
      forums and help centre articles about problems. Find the recurring complaints in their own
      words. Scantron has decades of institutional history: search for what goes wrong with it
      too. Report what is complained about MOST, not what is most interesting.`,
  },
  {
    key: 'marks',
    brief: `How students actually mark, and how that breaks detection. Research and enumerate
      every way a mark goes wrong: shading too lightly, shading with a pen when pencil was asked
      for, coloured or gel ink, ticking or crossing instead of filling, circling the letter
      instead of the bubble, marking outside the bubble or between two bubbles, shading two
      bubbles, erasing incompletely and the graphite ghost that remains, changing an answer,
      pressing so hard the paper indents, filling only partly, and doodling on the sheet. For
      each, say what it does to a fill ratio and what commercial OMR systems do about it. Look
      for actual OMR research literature on threshold selection and erasure detection.`,
  },
  {
    key: 'capture',
    brief: `Capture conditions, phone and scanner. For phones: shadow across the page, the
      photographer's own shadow, glare from ceiling lights and windows, low light, motion blur,
      rolling shutter, an angled shot, page curl when the paper is not flat, a phone that
      compresses the image hard, autofocus hunting, and cheap camera lens distortion. For
      document scanners: skew from the feeder, double feeds, jams, dust lines, the difference
      between 200 and 300 dpi, colour versus greyscale versus bitonal output, and what a
      multifunction copier does to a page by default. Say which of these a piece of software can
      correct and which it must detect and refuse.`,
  },
  {
    key: 'printing',
    brief: `Everything that ruins a sheet before a student touches it. Printing at the wrong
      scale or with fit to page, a printer's own unprintable margin cropping a corner mark,
      low toner making the marks faint, photocopying a photocopy and the drift that accumulates,
      printing on coloured or thin or glossy paper, duplex printing bleed through, a laser
      printer's toner sheen causing glare, and a page that comes out of a copier stretched.
      Research how commercial OMR vendors instruct users to print, and what tolerance they
      state. Find whether anyone publishes a measurable print check.`,
  },
  {
    key: 'process',
    brief: `Human and process failure, which is often bigger than any of the technical ones.
      What do teachers and institutions get wrong operationally: students not filling the id
      grid or filling it wrong, writing a name but not bubbling it, a student using the wrong
      form version, a teacher scanning the answer key as a student paper, scanning one paper
      twice, mixing two classes in a stack, a missing paper nobody notices, grading against the
      wrong key, results that cannot be traced back to a specific paper when a student
      challenges a grade, and the appeals process a school needs. Also research what an
      institution needs for audit and for a grade dispute. This angle matters more than it
      looks.`,
  },
];

const results = await pipeline(
  ANGLES,
  (a) =>
    agent(
      `${CONTEXT}

YOUR ANGLE: ${a.brief}

Search the web thoroughly before writing anything. Prefer real user voices and vendor
documentation over blog summaries. Every finding needs a source URL or an explicit admission
that you are reasoning. Report how common each problem appears to be and on what basis.`,
      { label: `sweep:${a.key}`, phase: 'Sweep', schema: FINDINGS_SCHEMA, effort: 'high' },
    ),
  (found, a) =>
    agent(
      `${CONTEXT}

Findings gathered on the angle "${a.key}":
${JSON.stringify(found, null, 2)}

Turn every finding into a concrete defence for OUR product. For each: the mechanism, with real
numbers where numbers exist; where it lives (the sheet design, the scanning pipeline, the
interface, or the teacher's process); and how we would prove it works.

Be strict about three things. First, name the complaints our existing decisions already answer,
so we do not congratulate ourselves twice. Second, name what no software can fix, and say what
we do about it anyway, because refusing a bad scan clearly is itself a feature. Third, mark
each requirement mvp, after-mvp or watch, and be honest: a plan where everything is mvp is a
plan nobody can execute.`,
      { label: `defend:${a.key}`, phase: 'Defend', schema: DEFENCE_SCHEMA, effort: 'high' },
    ),
);

const defences = results.filter(Boolean);
log(`${defences.length} defence sets`);

phase('Critic');
const critic = await agent(
  `${CONTEXT}

Five angles were swept and turned into defences:
${JSON.stringify(defences, null, 2)}

You are the completeness critic. What is missing? Consider: a modality nobody searched, a
class of user nobody asked about, a failure that only appears at scale, something specific to
Arabic or to right to left sheets, something specific to Saudi or Gulf schools, accessibility
for a student who cannot shade neatly, and anything about the transition from a paper the
student holds to a number in a spreadsheet that nobody covered.

Search the web for the gaps you identify rather than only naming them. Return what you found,
with sources.`,
  { label: 'completeness', phase: 'Critic', effort: 'high' },
);

phase('Write');
const section = await agent(
  `${CONTEXT}

DEFENCES FROM FIVE ANGLES:
${JSON.stringify(defences, null, 2)}

COMPLETENESS CRITIC:
${critic}

Write a section for ${REPO}/docs/PLAN.md titled about the failure modes of automatic grading
and how we defend against them. Read the existing file first and match its voice, its numbering
and its density. It is written in Arabic prose with English identifiers.

Structure it so a builder can act on it:
- open with the two or three complaints that dominate everything else, with their evidence
- a table of failure modes: the mode, what it does to a read, our defence, and where it lives
- the defences grouped by where they live: the sheet itself, the scanning pipeline, the
  interface, and the teacher's process
- a subsection on capture: what we require of a phone photograph and of a scanner, and what we
  refuse rather than attempt
- a subsection on printing, with a measurable check the sheet itself makes possible
- a subsection on the human and process failures, including grade disputes and audit, which the
  research suggests matter more than they look
- the acceptance criteria this adds, numbered to continue from criterion 9
- what no software can fix, stated plainly

Rules: every claim that came from a cited source keeps its URL in a sources list at the end.
Anything inferred rather than cited is marked as such, because a plan that cannot tell the two
apart is worse than one with fewer claims. Mark each defence mvp, after-mvp or watch. No em
dashes anywhere in any language: use a comma or a full stop. Return markdown ready to paste.`,
  { label: 'plan-section', phase: 'Write', effort: 'max' },
);

return { defences, critic, section };
