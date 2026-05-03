import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AuthPage from "./pages/Auth";
import ConfirmWaitPage from "./pages/ConfirmWait";
import DashboardPage from "./pages/Dashboard";
import NewEstimationPage from "./pages/New";
import SessionPage from "./pages/Session";
import SharePage from "./pages/Share";

export default function App() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/auth" element={<Page><AuthPage /></Page>} />
        <Route path="/auth/confirm" element={<Page><ConfirmWaitPage /></Page>} />
        <Route path="/dashboard" element={<Page><DashboardPage /></Page>} />
        <Route path="/new" element={<Page><NewEstimationPage /></Page>} />
        <Route path="/session/:id" element={<Page><SessionPage /></Page>} />
        <Route path="/share/:token" element={<Page><SharePage /></Page>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function Page(props: React.PropsWithChildren) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="min-h-screen"
    >
      {props.children}
    </motion.div>
  );
}

