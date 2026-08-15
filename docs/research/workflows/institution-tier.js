export const meta = {
  name: 'institution-tier',
  description: 'Design the institutions tier: seats, invitations, quota delegation, bulk scanners',
  phases: [
    {
      title: 'Specialists',
      detail:
        'four independent designs: pricing, invitation security, roles and quota, scanner ingestion',
    },
    { title: 'Attack', detail: 'two adversarial lenses on each' },
    { title: 'Synthesise', detail: 'one plan section, with the tension resolved' },
  ],
};

const REPO = `/home/user/transferchecker`;

const CONTEXT = `
You are designing an INSTITUTIONS tier for TransferChecker, an Arabic-first OMR exam grading
product aimed at teachers in Saudi Arabia and the wider Arabic speaking market.

READ THESE FIRST, they are the ground truth and you must not contradict them without saying so:
- ${REPO}/docs/PLAN.md, especially section 0 (MVP scope), section 5 (database schema),
  section 6 (offline first sync), section 7 (security and encryption),
  section 12 (tiers and the meter), section 11 (acceptance criteria)
- ${REPO}/docs/COMPETITIVE-NOTES.md section 4 (the competitor's pricing, and why every row of
  their table is a checkmark in both columns) and finding 36 (grading a PDF file, a second
  scan source besides the camera)
- ${REPO}/docs/DEVLOG.md, the entry titled about the competitor pricing page

DECISIONS ALREADY MADE THAT YOU MUST WORK WITH:
1. Two consumer tiers, free and Pro. The ONLY difference is a monthly meter of graded papers,
   100 free against unlimited. **Zero feature gates.** The reason recorded is that a feature
   comparison table invites a teacher to weigh us against a mature competitor costing 6.99
   dollars a year, while a single meter moves the question to whether the thing works in
   Arabic, which is our ground.
2. Billing is non-recurring: no automatic charge, the user is prompted at the end of the term.
3. The licence is per person, not per device.
4. The app is offline first. SQLite on the device is the only source of truth and the network
   is an optimisation. The meter is therefore counted locally and synced as a cumulative
   counter, and we accept in writing that a user who stays offline deliberately can exceed it.
5. Every table carries org_id from day one, even though today an org is one teacher.
6. The competitor anchors the market at 6.99 dollars a year, roughly 26 Saudi riyals a year.
7. All processing happens on the device. Images are never uploaded or stored, which is both a
   privacy promise and what keeps our marginal cost near zero.

WHAT THE PRODUCT OWNER HAS ASKED FOR, IN THEIR WORDS, TRANSLATED:
- Add a business or institutions plan account.
- It supports advanced and fast document scanners, FOR INSTITUTIONS ONLY.
- An institution can invite accounts: the institution administrator enters the email and the
  name of the person to invite, that person receives an email with a link to set a password
  and activate the account.
- The institution administrator can manage the accounts they invited, and allocate quotas
  between them.
- Follow best practice in institutional grading systems.
- Decide the appropriate number of users yourself, weighing price, quality and best practice.

THE TENSION YOU MUST NOT PAPER OVER:
"Fast scanner support for institutions only" is a FEATURE GATE, and decision 1 above says we
have zero feature gates. Either the no-gates rule is scoped to the consumer product and the
institution tier is a different product for a different buyer, or the rule is being broken.
Say which, and defend it.

Today's date is 14 August 2026. Where you cite an external practice, a standard or a library,
verify it is current as of 2026 rather than recalling it, and say how you verified it.
`;

const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'recommendation', 'decisions', 'schemaChanges', 'risks', 'rejected'],
  properties: {
    area: { type: 'string' },
    recommendation: { type: 'string', description: 'the headline call, one paragraph' },
    decisions: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'rationale', 'alternativeRejected'],
        properties: {
          decision: { type: 'string' },
          rationale: { type: 'string' },
          alternativeRejected: { type: 'string' },
        },
      },
    },
    schemaChanges: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['table', 'change', 'why'],
        properties: {
          table: { type: 'string' },
          change: { type: 'string' },
          why: { type: 'string' },
        },
      },
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
    rejected: {
      type: 'string',
      description: 'the most tempting wrong answer in this area, and why it is wrong',
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'lens', 'score', 'worstProblem', 'concreteFailure', 'fix'],
  properties: {
    area: { type: 'string' },
    lens: { type: 'string' },
    score: { type: 'number' },
    worstProblem: { type: 'string' },
    concreteFailure: {
      type: 'string',
      description: 'a specific sequence of events that goes wrong, not a generality',
    },
    fix: { type: 'string' },
  },
};

phase('Specialists');
const AREAS = [
  {
    key: 'pricing',
    brief: `Pricing and seat model. Decide the concrete numbers: how many seats an institution
      tier includes, what the tiers are called, how it is priced (per seat, per band, flat), and
      how that sits against a competitor anchored at 6.99 dollars a year per teacher. Consider
      the real buyer: a Saudi school or a university department, buying with a budget and a
      purchase order, on an academic year cycle, often needing an invoice and a tax number.
      Consider whether non-recurring billing survives contact with an institutional buyer.
      Research what comparable institutional assessment and grading products charge in 2026 and
      cite what you find. Give a specific recommended seat count and price band and defend it.`,
  },
  {
    key: 'invitation',
    brief: `Invitation and account activation, designed as a security engineer. The flow is: an
      administrator types a name and an email, the person receives a link, sets a password, and
      the account activates. Specify it completely and safely: token generation and entropy,
      storage (hashed, never plaintext), single use, expiry, what happens on re-invite, on an
      already registered email, on an expired link, and on a link that leaks. Address email
      enumeration, invitation spam, and an administrator inviting an address they do not
      control. Cover password requirements against current 2026 guidance rather than folklore,
      and say where session and password handling sits given we use Supabase Auth. Say what
      must be true before an invited account can read any institution data.`,
  },
  {
    key: 'roles',
    brief: `Roles, permissions, quota delegation and the data model. Design who can do what:
      the institution administrator, an ordinary teacher seat, and any role in between that
      earns its existence. Design quota allocation: does the institution hold one pool that
      seats draw from, or does the administrator hand each seat a number, and what happens when
      a seat runs out mid class. Remember the meter is counted on the device offline and synced
      as a cumulative counter, so a shared pool has a real distributed systems problem. Specify
      the schema changes concretely against the existing tables and specify the row level
      security rules. Cover what happens when a teacher leaves the institution: who owns the
      exams, the students and the results.`,
  },
  {
    key: 'scanners',
    brief: `Bulk scanner ingestion, and why it is an institution capability. Establish what
      "advanced and fast document scanners" actually means in a school in 2026: what devices,
      what they output, and how the output reaches software. Cover multi page PDF and TIFF, the
      network folder or email that a multifunction copier drops files into, and what a duplex
      sheet feeder at 60 pages a minute implies. Then design the ingestion: how a stack of
      hundreds of pages becomes hundreds of graded papers, how pages that fail are surfaced
      rather than lost, how it interacts with our decision never to store images, and how the
      existing single image scanning path is reused rather than duplicated. Note our
      competitive notes already record a "grade a PDF file" feature as outside the MVP but
      immediately after it. Say honestly whether this belongs on the device, in the browser, or
      on a server, given that our whole privacy promise is that images are never uploaded.`,
  },
];

const designs = (
  await parallel(
    AREAS.map(
      (a) => () =>
        agent(
          `${CONTEXT}

YOUR AREA: ${a.brief}

Be concrete. Real numbers, real table columns, real token lifetimes, real device models or
file formats where relevant. A design that could describe any product scores zero. Where you
depart from a decision already made, say so explicitly and justify it.`,
          { label: `design:${a.key}`, phase: 'Specialists', schema: DESIGN_SCHEMA, effort: 'high' },
        ),
    ),
  )
).filter(Boolean);

log(`${designs.length} area designs, attacking each from two lenses`);

phase('Attack');
const LENSES = [
  `security and abuse: find the sequence of events where someone reads or changes data they
   should not, or where an institution administrator can harm a teacher, or where the invitation
   flow leaks or is abused. Assume a motivated attacker with a valid free account.`,
  `fit with what already exists: does this survive our offline first architecture, our promise
   that images are never uploaded, our zero feature gates rule, our non-recurring billing, and
   the fact that the meter is a local counter that syncs. Find where it quietly contradicts one
   of them.`,
];

const verdicts = (
  await parallel(
    designs.flatMap((design) =>
      LENSES.map(
        (lens) => () =>
          agent(
            `${CONTEXT}

Attack this design for the institutions tier through ONE lens.

LENS: ${lens}

DESIGN:
${JSON.stringify(design, null, 2)}

Give a concrete failure: a specific ordered sequence of events that goes wrong, with the actor
and the data involved. Generalities score zero. If the design genuinely holds under your lens,
say so plainly rather than inventing a problem.`,
            {
              label: `attack:${design.area}`,
              phase: 'Attack',
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
  `${CONTEXT}

FOUR AREA DESIGNS:
${JSON.stringify(designs, null, 2)}

ATTACKS, two lenses on each:
${JSON.stringify(verdicts, null, 2)}

Write the institutions tier as a section to be added to ${REPO}/docs/PLAN.md. Match the voice
and structure of the existing document: numbered decisions, each with its rationale and the
alternative rejected. Read the file first so the section fits what is around it.

It must settle, concretely:
- the tier structure and the recommended seat count and price band, with the reasoning
- how the feature gate tension is resolved, stated as a decision rather than glossed
- the invitation and activation flow end to end, with token lifetime, storage and expiry
- roles, and exactly what each may do
- quota delegation, including what happens when a device is offline and a seat runs out
- what happens to a teacher's exams and results when they leave the institution
- bulk scanner ingestion: where it runs, what it accepts, and how it honours the promise that
  images are never uploaded
- the schema changes, as a diff against the existing tables in section 5
- the acceptance criteria this adds to section 11
- anything that genuinely needs the product owner to decide, kept short

Every fix that an attacker found must be either applied or explicitly refused with a reason.
English prose in the document body is fine for identifiers and code, but the prose itself must
be Arabic to match the file. No em dashes anywhere, in any language: use a comma or a full
stop. Return the section as markdown, ready to paste.`,
  { label: 'synthesis', phase: 'Synthesise', effort: 'max' },
);

return { designs, verdicts, final };
