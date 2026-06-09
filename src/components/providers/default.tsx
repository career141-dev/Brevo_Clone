import { type ReactNode } from "react";
import { AppQueryClientProvider } from "./query-client.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";

export function DefaultProviders({ children }: { children: ReactNode }) {
  return (
    <AppQueryClientProvider>
      <ThemeProvider>
        {children}
        <Toaster position="top-center" />
      </ThemeProvider>
    </AppQueryClientProvider>
  );
}
