import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth.ts";
import { Button } from "./button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog.tsx";
import { Input } from "./input.tsx";
import { Label } from "./label.tsx";

export function SignInButton({ className }: { className?: string }) {
  const { signin, register } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("demo@career141.com");
  const [password, setPassword] = useState("password");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required");
      return;
    }
    if (mode === "register" && !name.trim()) {
      toast.error("Name is required");
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        await register({ name, email, password });
        toast.success("Demo account created");
      } else {
        await signin({ email, password });
        toast.success("Signed in with demo account");
      }
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className}>Sign In</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "signin" ? "Sign in" : "Create account"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "signin" ? "secondary" : "ghost"}
              onClick={() => setMode("signin")}
            >
              Login
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "register" ? "secondary" : "ghost"}
              onClick={() => setMode("register")}
            >
              Register
            </Button>
          </div>

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="dummy-name">Name</Label>
              <Input
                id="dummy-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Demo User"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dummy-email">Email</Label>
            <Input
              id="dummy-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="demo@career141.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dummy-password">Password</Label>
            <Input
              id="dummy-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : mode === "signin" ? "Login" : "Register"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
