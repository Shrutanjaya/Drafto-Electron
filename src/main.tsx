import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/providers/auth-provider";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DevSimPanel } from "@/components/dev/dev-sim-panel";
import "./globals.css";

// Lazy-load heavy pages to keep startup fast
const DraftoClient = React.lazy(() =>
  import("@/components/drafto-client").then((m) => ({ default: m.DraftoClient }))
);
const LoginPage = React.lazy(() => import("@/pages/login"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={
          <React.Suspense fallback={null}><LoginPage /></React.Suspense>
        } />
        <Route path="/" element={
          <ProtectedRoute requireAuth>
            <main className="w-full px-2 py-4">
              <React.Suspense fallback={null}><DraftoClient /></React.Suspense>
            </main>
          </ProtectedRoute>
        } />
      </Routes>
      <Toaster />
      <DevSimPanel />
    </AuthProvider>
  </HashRouter>
);
