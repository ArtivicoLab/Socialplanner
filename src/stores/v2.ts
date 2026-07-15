// Content module stores built on the CRUD factory.
import { createCrud } from "./crud";
import { todayISO } from "../lib/dates";
import type { HashtagGroup, Highlight, Idea, MonthlyGoal, MoodBoardPin, PerfEntry, Platform, Post } from "../lib/types";

export const usePosts = createCrud<Post>("posts", () => ({
  date: todayISO(),
  time: "",
  pillar: "",
  format: "post",
  goal: "",
  idea: "",
  status: "notstarted",
  hook: "",
  caption: "",
  cta: "",
  hashtagGroupId: "",
  hashtags: "",
  platforms: [],
  image: "",
  cover: "",
  notes: "",
}));

export const useHashtagGroups = createCrud<HashtagGroup>("hashtagGroups", () => ({
  name: "",
  tags: "",
  order: 0,
}));

export const useIdeas = createCrud<Idea>("ideas", () => ({
  title: "",
  notes: "",
  pillar: "",
  format: "post",
  used: false,
}));

export const usePlatforms = createCrud<Platform>("platforms", () => ({
  name: "",
  active: true,
  order: 0,
  followersGoal: 0,
  engagementGoal: 0,
  reachGoal: 0,
}));

export const usePerformance = createCrud<PerfEntry>("performance", () => ({
  platform: "",
  month: "",
  followers: 0,
  engagement: 0,
  reach: 0,
}));

export const useHighlights = createCrud<Highlight>("highlights", () => ({
  date: todayISO(),
  label: "",
}));

export const useMoodBoardPins = createCrud<MoodBoardPin>("moodBoardPins", () => ({
  month: todayISO().slice(0, 7),
  image: "",
  note: "",
  order: 0,
}));

export const useMonthlyGoals = createCrud<MonthlyGoal>("monthlyGoals", () => ({
  month: todayISO().slice(0, 7),
  text: "",
  done: false,
  order: 0,
}));
