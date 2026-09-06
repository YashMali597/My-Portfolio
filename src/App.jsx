import { BrowserRouter, Routes, Route } from "react-router-dom";
import SiteNav from "./components/SiteNav";
import Footer from "./components/Footer";
import Contact from "./components/Contact";
import HomePage from "./pages/HomePage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectPage from "./pages/ProjectPage";
import ExperiencePage from "./pages/ExperiencePage";
import AchievementsPage from "./pages/AchievementsPage";

function App() {
  return (
    <BrowserRouter>
      <div className="scanline-overlay" aria-hidden="true"></div>
      <SiteNav />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:slug" element={<ProjectPage />} />
          <Route path="/experience" element={<ExperiencePage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          {/* /system is deliberately NOT routed. The page component is no
              longer imported, so the architecture write-up, ADRs, tool registry
              and eval results are not in the client bundle at all — not merely
              hidden behind an unlinked URL. Anyone visiting /system lands on
              the homepage via the catch-all below. */}
          {/* Unknown routes fall back to the homepage rather than a dead end. */}
          <Route path="*" element={<HomePage />} />
        </Routes>
        <Contact />
      </main>
      <Footer />
    </BrowserRouter>
  );
}

export default App;
