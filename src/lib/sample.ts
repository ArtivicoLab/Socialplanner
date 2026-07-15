// First-run sample data — the memory-only demo (see stores/bootstrap.ts).
// Deterministic ids (`smpl-N`) so re-seeding is idempotent, and every date is
// anchored relative to today so the calendar, monthly plan, feed preview and
// performance charts always look alive no matter when the demo is opened.

import { addDaysISO, addMonthsISO, todayISO } from "./dates";
import type {
  HashtagGroup,
  Highlight,
  Idea,
  MonthlyGoal,
  MoodBoardPin,
  PerfEntry,
  Platform,
  Post,
  PostFormat,
  PostStatus,
} from "./types";
import { DEFAULT_PLATFORMS } from "./types";

export interface Seed {
  posts: Post[];
  hashtagGroups: HashtagGroup[];
  ideas: Idea[];
  platforms: Platform[];
  performance: PerfEntry[];
  highlights: Highlight[];
  moodBoardPins: MoodBoardPin[];
  monthlyGoals: MonthlyGoal[];
}

let n = 0;
const id = () => `smpl-${++n}`;

export function buildSample(): Seed {
  n = 0;
  const today = todayISO();
  const ts = `${today}T08:00:00.000Z`;
  const base = { createdAt: ts, updatedAt: ts };

  // ---- Platforms (first 4 active, with goals for the tracker) ----
  const platformGoals: Record<string, [number, number, number]> = {
    Instagram: [5000, 6, 20000],
    Facebook: [2500, 4, 9000],
    TikTok: [8000, 8, 40000],
    Pinterest: [1500, 3, 12000],
  };
  const platforms: Platform[] = DEFAULT_PLATFORMS.map((name, i) => {
    const g = platformGoals[name];
    return {
      id: id(),
      name,
      active: i < 4,
      order: i,
      followersGoal: g?.[0] ?? 0,
      engagementGoal: g?.[1] ?? 0,
      reachGoal: g?.[2] ?? 0,
      ...base,
    };
  });

  // ---- Hashtag groups ----
  const groupsSpec: [string, string][] = [
    [
      "Content Creation",
      "#contentcreator #createcontent #contentideas #contentstrategy #contentmarketing #digitalcontent #contentplanner #socialmediatips #marketingtips #contentcalendar #captionideas #contentplan",
    ],
    [
      "Small Business",
      "#smallbusiness #entrepreneur #businessowner #onlinebusiness #womeninbusiness #businesscoach #startuplife #creativebusiness #freelancelife #solopreneur",
    ],
    [
      "Productivity & Planning",
      "#productivity #goalsetter #timemanagement #productivitytips #planneraddict #planningtools #focusmode #getorganized #weeklyplanning #planwithme #dailyplanner",
    ],
    [
      "Self Growth & Mindset",
      "#personaldevelopment #selfgrowth #mindsetshift #growthmindset #mentalclarity #confidencecoach #selfawareness #journalingtips #selfcaretools #mindfulness",
    ],
    [
      "Lifestyle & Aesthetic",
      "#lifestyleblogger #aestheticfeed #softlife #dailyinspo #neutralaesthetic #cozyvibes #minimalmood #cleanfeed #visualdiary #contentstyle",
    ],
  ];
  const hashtagGroups: HashtagGroup[] = groupsSpec.map(([name, tags], i) => ({
    id: id(),
    name,
    tags,
    order: i,
    ...base,
  }));
  const groupId = (name: string) => hashtagGroups.find((g) => g.name === name)!.id;

  // ---- Posts: a rolling ~10-week plan (6 weeks back, 4 weeks ahead) ----
  // Everything before today is Published; today is mid-flight; the future
  // ramps Scheduled -> Draft Ready -> In Progress -> Not Started, so every
  // status chip and chart has something real to show.
  interface Spec {
    idea: string;
    pillar: string;
    format: PostFormat;
    goal: string;
    hook: string;
    caption: string;
    cta: string;
    group: string;
    platforms: string[];
  }
  const IG = "Instagram";
  const FB = "Facebook";
  const TT = "TikTok";
  const PIN = "Pinterest";
  const specs: Spec[] = [
    {
      idea: "Productivity tip",
      pillar: "Promotion",
      format: "reel",
      goal: "Sales",
      hook: "Struggling to stay focused?",
      caption: "Here's the 5-minute rule that changed how I work forever.",
      cta: "Save this tip for later!",
      group: "Productivity & Planning",
      platforms: [IG, TT],
    },
    {
      idea: "Weekly content plan",
      pillar: "Education",
      format: "post",
      goal: "Follows",
      hook: "Plan smarter, not harder.",
      caption: "My go-to weekly content workflow, start to finish.",
      cta: "Grab your copy via the link!",
      group: "Content Creation",
      platforms: [IG, FB],
    },
    {
      idea: "Behind the scenes",
      pillar: "Lifestyle",
      format: "story",
      goal: "Likes",
      hook: "This is how I create my templates.",
      caption: "Ever wondered what goes into designing a digital planner? Peek inside.",
      cta: "Follow for more BTS content!",
      group: "Lifestyle & Aesthetic",
      platforms: [IG],
    },
    {
      idea: "Freebie offer",
      pillar: "Promotion",
      format: "post",
      goal: "Sales",
      hook: "This one's 100% free, no catch.",
      caption: "Grab your free 30-day habit tracker inside our freebie hub.",
      cta: "DM \"Freebie\" to get the link!",
      group: "Small Business",
      platforms: [IG, FB, PIN],
    },
    {
      idea: "Mistake to avoid",
      pillar: "Education",
      format: "reel",
      goal: "Views",
      hook: "Stop doing this when planning.",
      caption: "Are you wasting time batching the wrong way? Here's what to do instead.",
      cta: "Tag a friend who needs this!",
      group: "Productivity & Planning",
      platforms: [TT, IG],
    },
    {
      idea: "Before/after planning style",
      pillar: "Entertainment",
      format: "story",
      goal: "Likes",
      hook: "I used to wing it every day...",
      caption: "Now I map out every post with a 12-month visual layout.",
      cta: "Want a look? Click the link.",
      group: "Self Growth & Mindset",
      platforms: [IG, FB],
    },
    {
      idea: "Template walkthrough",
      pillar: "Education",
      format: "video",
      goal: "Saves",
      hook: "Auto-fill magic in action.",
      caption: "How one tab updates your entire calendar in real time.",
      cta: "Try it yourself with the link in bio!",
      group: "Content Creation",
      platforms: [TT],
    },
    {
      idea: "Quote of the week",
      pillar: "Quote",
      format: "post",
      goal: "Shares",
      hook: "New month, fresh plan.",
      caption: "Consistency beats intensity. Plan the week, then live it.",
      cta: "Share this with your planning buddy!",
      group: "Self Growth & Mindset",
      platforms: [IG, PIN],
    },
    {
      idea: "Content batching tutorial",
      pillar: "Education",
      format: "reel",
      goal: "Follows",
      hook: "Save 4 hours a week doing this.",
      caption: "My content batching workflow in 4 easy steps, with visuals.",
      cta: "Follow for weekly workflows!",
      group: "Productivity & Planning",
      platforms: [IG, TT, FB],
    },
    {
      idea: "Planner aesthetic reel",
      pillar: "Lifestyle",
      format: "reel",
      goal: "Views",
      hook: "POV: planning feels fun again.",
      caption: "Swipe to see how satisfying this layout is.",
      cta: "Comment \"link\" if you want it!",
      group: "Lifestyle & Aesthetic",
      platforms: [IG, TT],
    },
    {
      idea: "Feed preview demo",
      pillar: "Promotion",
      format: "post",
      goal: "Sales",
      hook: "Plan it, see it, love it.",
      caption: "Preview your feed before you post, automatically.",
      cta: "Want this tool? Link in bio!",
      group: "Small Business",
      platforms: [FB, IG],
    },
    {
      idea: "Audience poll",
      pillar: "Entertainment",
      format: "story",
      goal: "Likes",
      hook: "What do you struggle with most?",
      caption: "Planning ahead vs. posting on the fly: vote in the poll.",
      cta: "Vote and tell me why!",
      group: "Content Creation",
      platforms: [IG],
    },
    {
      idea: "Monthly reset routine",
      pillar: "Lifestyle",
      format: "video",
      goal: "Saves",
      hook: "New month, fresh plan.",
      caption: "Here's how I prep my social content every first Sunday.",
      cta: "Save this for your next reset!",
      group: "Productivity & Planning",
      platforms: [TT, IG],
    },
    {
      idea: "Template announcement",
      pillar: "Promotion",
      format: "post",
      goal: "Sales",
      hook: "It's here!",
      caption: "The new Smart Social Planner is now live, built for creators.",
      cta: "Check it out on our site!",
      group: "Small Business",
      platforms: [IG, FB, PIN],
    },
  ];

  const times = ["06:00", "09:30", "12:30", "15:00", "18:00", "20:30"];
  const covers = [
    "var(--cat-pink)", "var(--cat-teal)", "var(--cat-lavender)", "var(--cat-butter)",
    "var(--cat-sky)", "var(--cat-mint)", "var(--cat-rose)", "var(--cat-gold)",
  ];
  const posts: Post[] = [];
  // ~1.3 posts/day: two on every third day. Past = published; future ramps
  // through the working statuses.
  for (let d = -42; d <= 28; d++) {
    const date = addDaysISO(today, d);
    const slots = ((d % 3) + 3) % 3 === 0 ? 2 : 1;
    for (let k = 0; k < slots; k++) {
      const i = posts.length;
      const spec = specs[i % specs.length];
      let status: PostStatus;
      if (d < 0) status = "published";
      else if (d === 0) status = k === 0 ? "published" : "scheduled";
      else if (d <= 7) status = "scheduled";
      else if (d <= 14) status = "draft";
      else if (d <= 21) status = "inprogress";
      else status = "notstarted";
      posts.push({
        id: id(),
        date,
        time: times[i % times.length],
        pillar: spec.pillar,
        format: spec.format,
        goal: spec.goal,
        idea: spec.idea,
        status,
        hook: spec.hook,
        caption: spec.caption,
        cta: spec.cta,
        hashtagGroupId: groupId(spec.group),
        hashtags: "",
        platforms: spec.platforms,
        // A stable placeholder photo per post (like a =IMAGE(url) cell). If it
        // can't load (offline), the tile falls back to the `cover` swatch.
        image: `https://picsum.photos/seed/socialplanner-${i}/400/500`,
        cover: covers[i % covers.length],
        notes: "",
        ...base,
      });
    }
  }

  // ---- Idea bank ----
  const ideasSpec: [string, string, PostFormat][] = [
    ["Client testimonial carousel", "Promotion", "carousel"],
    ["3 hooks that stopped the scroll", "Education", "reel"],
    ["My desk setup tour", "Lifestyle", "video"],
    ["Myth vs fact: posting daily", "Education", "post"],
    ["Trending audio remix", "Entertainment", "reel"],
    ["Q&A from the comments", "Entertainment", "story"],
    ["Quarterly goals check-in", "Quote", "post"],
    ["One template, five looks", "Promotion", "carousel"],
  ];
  const ideas: Idea[] = ideasSpec.map(([title, pillar, format], i) => ({
    id: id(),
    title,
    notes: i === 0 ? "Collect 3 recent reviews first." : "",
    pillar,
    format,
    used: i >= 6,
    ...base,
  }));

  // ---- Performance: trailing 12 months for the 4 active platforms ----
  const perfBase: Record<string, [number, number, number]> = {
    Instagram: [2400, 4.2, 9000],
    Facebook: [1600, 2.8, 5200],
    TikTok: [3100, 6.5, 15000],
    Pinterest: [700, 1.9, 6800],
  };
  const performance: PerfEntry[] = [];
  for (const [name, [f0, e0, r0]] of Object.entries(perfBase)) {
    for (let m = 11; m >= 0; m--) {
      const month = addMonthsISO(today, -m).slice(0, 7);
      const growth = 11 - m; // 0 .. 11
      const wobble = growth % 3 === 2 ? -0.2 : 0.1 * (growth % 2);
      performance.push({
        id: id(),
        platform: name,
        month,
        followers: Math.round(f0 * (1 + growth * 0.09)),
        engagement: Math.round((e0 * (1 + growth * 0.03) + wobble) * 10) / 10,
        reach: Math.round(r0 * (1 + growth * 0.12)),
        ...base,
      });
    }
  }

  // ---- Highlight dates ----
  const highlights: Highlight[] = [
    { id: id(), date: addDaysISO(today, 8), label: "Launch Day", ...base },
    { id: id(), date: addDaysISO(today, 3), label: "Pay Day", ...base },
    { id: id(), date: addDaysISO(today, 15), label: "Travel Day", ...base },
    { id: id(), date: addDaysISO(today, -5), label: "Collab shoot", ...base },
  ];

  // ---- Mood board: a few pinned inspiration images for the current month ----
  const moodBoardPins: MoodBoardPin[] = [
    "mood-planner-flatlay", "mood-color-palette", "mood-editorial-shoot", "mood-typography-ref",
  ].map((seed, i) => ({
    id: id(),
    month: today.slice(0, 7),
    image: `https://picsum.photos/seed/socialplanner-${seed}/300/300`,
    note: ["Flat-lay lighting ref", "This month's palette", "Editorial mood", ""][i],
    order: i,
    ...base,
  }));

  // ---- Monthly goals: a short checklist of objectives for the current month ----
  const monthlyGoalsSpec: [string, boolean][] = [
    ["Boost Instagram engagement by 15%", false],
    ["Expand audience with 2 new lead magnets", false],
    ["Share behind-the-scenes stories weekly", true],
    ["Batch-record 4 reels for next month", false],
  ];
  const monthlyGoals: MonthlyGoal[] = monthlyGoalsSpec.map(([text, done], i) => ({
    id: id(),
    month: today.slice(0, 7),
    text,
    done,
    order: i,
    ...base,
  }));

  return { posts, hashtagGroups, ideas, platforms, performance, highlights, moodBoardPins, monthlyGoals };
}
