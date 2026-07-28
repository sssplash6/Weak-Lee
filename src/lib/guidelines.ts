// The internal guides published on /guidelines. Content mirrors each PDF's own
// cover block (title, purpose line, version, owner, approver) and its numbered
// section list, so the page reads as a shelf of the real documents rather than a
// list of download links. The PDFs themselves live in public/guidelines/.
//
// Adding a guide: drop the PDF in public/guidelines, add an entry here with its
// section list, and pick a tone that isn't already taken in its group.

/** Which accent identifies the document — see the guide tokens in globals.css. */
export type GuideTone = "indigo" | "teal" | "plum" | "cyan" | "olive";

export type Guide = {
  /** Anchor id and jump-chip key. */
  slug: string;
  title: string;
  /** The document's own kicker, e.g. "Internal guide · For all employees". */
  kicker: string;
  /** The purpose line from the cover. */
  purpose: string;
  /** Two or three letters for the banner stamp. */
  monogram: string;
  tone: GuideTone;
  /** Null for the guides that carry no version block. */
  version: string | null;
  dated: string;
  owner: { name: string; role: string } | null;
  approvedBy: { name: string; role: string } | null;
  pages: number;
  /** Public path to the PDF. */
  file: string;
  /** Numbered sections, in the order the document lists them. */
  sections: string[];
};

export type GuideGroup = {
  title: string;
  blurb: string;
  guides: Guide[];
};

const GOAL_SETTING: Guide = {
  slug: "goal-setting",
  title: "Goal Setting Guidelines",
  kicker: "Internal guide · For all employees",
  purpose:
    "How to write effective, accurate, and actionable goals — with examples from Freshman Academy.",
  monogram: "GS",
  tone: "indigo",
  version: "v1.1",
  dated: "May 2026",
  owner: { name: "Safina Teshabayeva", role: "COO" },
  approvedBy: { name: "Valera Arakelyan", role: "CEO, Freshman Academy" },
  pages: 7,
  file: "/guidelines/goal-setting-guidelines.pdf",
  sections: [
    "Why Goals Matter",
    "The SMART Checklist",
    "The Goal Formula",
    "Goals and Tasks Are Not the Same Thing",
    "Examples by Department · Vague vs Specific",
    "Useful Verbs to Start With",
    "Rules We Follow",
    "Mistakes We See and How to Fix Them",
  ],
};

export const GUIDE_GROUPS: GuideGroup[] = [
  {
    title: "Leading a department",
    blurb:
      "For anyone who owns a department's numbers, its team, and its weekly commitments.",
    guides: [
      {
        slug: "department-leadership",
        title: "Department Leadership Guidelines",
        kicker: "Internal guide · For department leaders",
        purpose:
          "How to lead a department at Freshman Academy: positioning, finances, team management, and the mindset required to deliver results.",
        monogram: "DL",
        tone: "teal",
        version: "v1.0",
        dated: "June 2026",
        owner: { name: "Niyozbek Komilov", role: "AP Department Leader" },
        approvedBy: {
          name: "Valera Arakelyan",
          role: "Founder, Freshman Academy",
        },
        pages: 5,
        file: "/guidelines/department-leadership-guidelines.pdf",
        sections: [
          "Positioning vs. Marketing",
          "Competitive Advantage",
          "Finances and Incentive Systems",
          "Team Management",
          "Leadership Qualities Required",
          "Goals, Deadlines, and Accountability",
        ],
      },
      {
        slug: "admissions-program",
        title: "Admissions Program — Leadership Guide",
        kicker: "Internal · 2026 · For the Head of Admissions Program",
        purpose:
          "The program's goal and tracks, keeping students close, and what the department leader owns week to week.",
        monogram: "AP",
        tone: "plum",
        version: null,
        dated: "2026",
        owner: null,
        approvedBy: null,
        pages: 5,
        file: "/guidelines/admissions-program-leadership-guide.pdf",
        sections: [
          "Program Goal & Tracks",
          "Keeping the Connection With Students",
          "Identifying & Supporting Strong Students",
          "Program Narrative",
          "Department Leader Responsibilities",
        ],
      },
    ],
  },
  {
    title: "Running a program, running the office",
    blurb:
      "Role guides for the people keeping students on pace and the space in shape.",
    guides: [
      {
        slug: "masters-mentors",
        title: "Master's Program Mentor Guidelines",
        kicker: "Internal guide · For mentors & the program coordinator",
        purpose:
          "How to run weekly sessions, track hours, coordinate the team, and keep every student on pace toward their Master's application deadlines.",
        monogram: "MP",
        tone: "cyan",
        version: "v1.0",
        dated: "June 2026",
        owner: { name: "Shakhzod Kodirov", role: "COO, Freshman Academy" },
        approvedBy: {
          name: "Valera Arakelyan",
          role: "Founder, Freshman Academy",
        },
        pages: 8,
        file: "/guidelines/masters-program-mentor-guidelines.pdf",
        sections: [
          "The Role of the Program Coordinator",
          "The Weekly Monday Message",
          "Sample Monday Message",
          "Session Agenda Format",
          "Hours Tracking",
          "Driving the Program, Not Just Managing It",
          "Interviews and Candidate Assessment",
          "What We Can and Cannot Guarantee",
          "Contracts and Payment Deadlines",
        ],
      },
      {
        slug: "office-management",
        title: "Office Management Guidelines",
        kicker: "Internal guide · For office staff",
        purpose:
          "How to manage, maintain, and take ownership of the Freshman Academy office space.",
        monogram: "OM",
        tone: "olive",
        version: "v1.0",
        dated: "June 2026",
        owner: {
          name: "Nurmuhammad Mirzaahmadov",
          role: "Office Manager",
        },
        approvedBy: {
          name: "Valera Arakelyan",
          role: "CEO, Freshman Academy",
        },
        pages: 6,
        file: "/guidelines/office-management-guidelines.pdf",
        sections: [
          "The Role of the Office Manager",
          "Core Character Traits Required",
          "Direct Responsibilities",
          "Space Standards & Photo Reference",
          "End of Day Checklist",
        ],
      },
    ],
  },
];

/** The guide everyone is measured against — shown first, on its own. */
export const FEATURED_GUIDE = GOAL_SETTING;

/** Every guide, featured first, in page order. */
export const ALL_GUIDES: Guide[] = [
  FEATURED_GUIDE,
  ...GUIDE_GROUPS.flatMap((g) => g.guides),
];
