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
import { WhatsNewBanner } from "./components/WhatsNewBanner";
import { ConfirmHost } from "./components/ConfirmDialog";

export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    bootstrap().then(() => {
      setReady(true);
      if (!hasSeenTour()) setShowTour(true);
    });
    preloadGis();
  }, []);

  function replayTour() {
    setShowTour(true);
  }

  // "Replay the welcome tour" from Settings: jump to the Dashboard first, then
  // open the coach on the next frame (so it scopes to the Dashboard, not the
  // screen the button was tapped on).
  useEffect(() => {
    const replayWelcome = () => {
      navigate("dashboard");
      requestAnimationFrame(() => setShowTour(true));
    };
    window.addEventListener("coach:welcome", replayWelcome);
    return () => window.removeEventListener("coach:welcome", replayWelcome);
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
      {showTour && <CoachTour onDone={() => setShowTour(false)} />}
    </div>
  );
}
