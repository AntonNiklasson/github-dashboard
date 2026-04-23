import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrCardPage } from "./pages/PrCardPage";
import { ShowcasePage } from "./pages/ShowcasePage";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function resolveRoot() {
  const path = window.location.pathname;
  if (path === "/components/pr-card") return <PrCardPage />;
  if (path === "/components" || path === "/components/showcase")
    return <ShowcasePage />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {resolveRoot()}
      <Toaster position="top-left" />
    </QueryClientProvider>
  </StrictMode>,
);
