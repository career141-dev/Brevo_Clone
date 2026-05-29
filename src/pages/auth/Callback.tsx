import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthCallback } from "@usehercules/auth/react";
import { Button } from "@/components/ui/button.tsx";

const STATUS_LABELS = {
  "processing-oauth": "Completing sign in...",
  "waiting-backend": "Connecting your workspace...",
  syncing: "Finishing setup...",
  success: "Redirecting...",
  error: "Sign in could not be completed",
};

export default function AuthCallback() {
  const navigate = useNavigate();

  const { status, error, retry } = useAuthCallback({
    isBackendAuthenticated: true,
    onSuccess: () => navigate("/", { replace: true }),
    onNoAuthParams: () => navigate("/", { replace: true }),
  });

  const isError = status === "error";

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center gap-4">
          {!isError && (
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          )}
          <div className="space-y-2">
            <h1 className="text-lg font-semibold">{STATUS_LABELS[status]}</h1>
            {isError && (
              <p className="text-sm text-muted-foreground">
                {error ?? "Please try signing in again."}
              </p>
            )}
          </div>
          {isError && (
            <div className="flex w-full gap-2">
              <Button className="flex-1" onClick={() => retry()}>
                Try again
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => navigate("/", { replace: true })}
              >
                Go home
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
