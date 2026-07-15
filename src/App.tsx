import { useEffect, useState } from "react";
import { useRoute, navigate } from "./router";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { Sidebar } from "./components/Sidebar";
import { DemoBanner } from "./components/DemoBanner";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { DashboardScreen } from "./features/dashboard/DashboardScreen";
import { SchedulerScreen } from "./features/scheduler/SchedulerScreen";
import { CalendarScreen } from "./features/calendar/CalendarScreen";
import { MonthlyScreen } from "./features/monthly/MonthlyScreen";
import { FeedScreen } from "./features/feed/FeedScreen";
import { HashtagsScreen } from "./features/hashtags/HashtagsScreen";
import { IdeasScreen } from "./features/ideas/IdeasScreen";
import { PerformanceScreen } from "./features/performance/PerformanceScreen";
import { WhatsNewScreen } from "./features/whatsnew/WhatsNewScreen";
import { MoreScreen } from "./features/more/MoreScreen";
import { PrivacyScreen } from "./features/privacy/PrivacyScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { bootstrap } from "./stores/bootstrap";
import { preloadGis } from "./lib/google/auth";
import { CoachTour, hasSeenTour } from "./components/CoachTour";
import type { Route } from "./router";
import { WhatsNewBanner } from "./components/WhatsNewBanner";
import { ConfirmHost } from "./components/ConfirmDialog";

export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStartTarget, setTourStartTarget] = useState<string | undefined>(undefined);

  useEffect(() => {
    bootstrap().then(() => {
      setReady(true);
      if (!hasSeenTour()) setShowTour(true);
    });
    preloadGis();
  }, []);

  function replayTour() {
    setTourStartTarget(undefined);
    setShowTour(true);
  }

  // "Replay the welcome tour" from Settings: jump to the Dashboard first, then
  // open the coach on the next frame (so it scopes to the Dashboard, not the
  // screen the button was tapped on).
  useEffect(() => {
    const replayWelcome = () => {
      setTourStartTarget(undefined);
      navigate("dashboard");
      requestAnimationFrame(() => setShowTour(true));
    };
    window.addEventListener("coach:welcome", replayWelcome);
    return () => window.removeEventListener("coach:welcome", replayWelcome);
  }, []);

  // Settings' FAQ list and "All coach tours" list (openScreenTour in
  // CoachTour.tsx): jump to one spotlight (target set) or a whole screen's
  // tour from the top (target omitted). Same navigate-then-open pattern as
  // "Replay the welcome tour" above, plus the target to start at.
  useEffect(() => {
    const openFaq = (e: Event) => {
      const { route: faqRoute, target } = (e as CustomEvent<{ route: Route; target?: string }>).detail;
      setTourStartTarget(target);
      navigate(faqRoute);
      requestAnimationFrame(() => setShowTour(true));
    };
    window.addEventListener("coach:faq", openFaq);
    return () => window.removeEventListener("coach:faq", openFaq);
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className={`app${route === "dashboard" ? " app--dashboard" : ""}`}>
      <Sidebar active={route} onCoachTour={replayTour} />
      <div className="app__col">
        <Header onCoachTour={replayTour} />
        <DemoBanner />
        <WhatsNewBanner />
        <main className={`app__main${route === "dashboard" ? " app__main--wide" : ""}`} key={route}>
          {route === "dashboard" && <DashboardScreen />}
          {route === "scheduler" && <SchedulerScreen />}
          {route === "calendar" && <CalendarScreen />}
          {route === "monthly" && <MonthlyScreen />}
          {route === "feed" && <FeedScreen />}
          {route === "hashtags" && <HashtagsScreen />}
          {route === "ideas" && <IdeasScreen />}
          {route === "performance" && <PerformanceScreen />}
          {route === "whatsnew" && <WhatsNewScreen />}
          {route === "more" && <MoreScreen />}
          {route === "privacy" && <PrivacyScreen />}
          {route === "settings" && <SettingsScreen />}
        </main>
      </div>
      <TabBar active={route} />
      <UpdatePrompt />
      <ConfirmHost />
      {showTour && (
        <CoachTour
          startTarget={tourStartTarget}
          onDone={() => {
            setShowTour(false);
            setTourStartTarget(undefined);
          }}
        />
      )}
    </div>
  );
}
