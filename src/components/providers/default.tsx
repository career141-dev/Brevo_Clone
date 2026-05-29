import { type ReactNode } from "react";
import { AuthProvider } from "./auth.tsx";
import { AppQueryClientProvider } from "./query-client.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";

export function DefaultProviders({ children }: { children: ReactNode }) {
  return (
    <AppQueryClientProvider>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </ThemeProvider>
    </AppQueryClientProvider>
  );
}
