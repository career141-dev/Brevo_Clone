import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Mail,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Settings,
  Bell,
  HelpCircle,
  Zap,
  MessageSquare,
  ShoppingCart,
  BarChart2,
  Bot,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { motion, AnimatePresence } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";

type NavGroup = {
  label?: string;
  items: {
    to: string;
    label: string;
    icon: React.ElementType;
    exact?: boolean;
  }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: "/", label: "Home", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "MARKETING",
    items: [
      { to: "/campaigns", label: "Campaigns", icon: Mail },
      { to: "/contacts", label: "Contacts", icon: Users },
      { to: "/automations", label: "Automations", icon: Zap },
    ],
  },
  {
    label: "ENGAGEMENT",
    items: [
      { to: "/transactional", label: "Transactional", icon: MessageSquare },
      { to: "/conversations", label: "Conversations", icon: Bot },
      { to: "/commerce", label: "Commerce", icon: ShoppingCart },
      { to: "/analytics", label: "Analytics", icon: BarChart2 },
    ],
  },
];

function NavItem({
  to,
  label,
  icon: Icon,
  exact,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer group",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary font-semibold"
            : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "size-4 shrink-0 transition-colors",
              isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
            )}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, isAuthenticated, signout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.profile.name
    ? user.profile.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const handleSignOut = async () => {
    await signout();
    navigate("/");
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border w-60">
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded bg-primary flex items-center justify-center">
            <Mail className="size-4 text-white" />
          </div>
          <span className="text-sm font-bold text-sidebar-foreground tracking-tight">
            Career141
          </span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 md:hidden"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.label && (
              <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold tracking-widest text-sidebar-foreground/35 uppercase">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavItem key={item.to} {...item} onClick={onClose} />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom user block */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <NavItem to="/settings" label="Settings" icon={Settings} onClick={onClose} />
        <NavItem to="/help" label="Help & Support" icon={HelpCircle} onClick={onClose} />

        {isAuthenticated && (
          <div className="mt-2 pt-2 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors cursor-pointer group">
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback className="text-[11px] font-semibold bg-primary/15 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold truncate text-sidebar-foreground">
                      {user?.profile.name ?? "User"}
                    </p>
                    <p className="text-[10px] text-sidebar-foreground/45 truncate">
                      {user?.profile.email}
                    </p>
                  </div>
                  <ChevronDown className="size-3.5 text-sidebar-foreground/40 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-52">
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="size-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {!isAuthenticated && (
          <div className="px-1 pt-2">
            <SignInButton className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="h-12 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-end gap-1 px-4 shrink-0">
      <Button variant="ghost" size="icon" className="size-8 cursor-pointer">
        <HelpCircle className="size-4 text-muted-foreground" />
      </Button>
      <Button variant="ghost" size="icon" className="size-8 cursor-pointer">
        <Bell className="size-4 text-muted-foreground" />
      </Button>
      <ThemeToggle className="size-8 cursor-pointer" />
    </header>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col shrink-0 h-screen sticky top-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: "tween", duration: 0.22 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-60 md:hidden"
            >
              <Sidebar onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 h-12 px-4 border-b border-border bg-card/80">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="size-6 rounded bg-primary flex items-center justify-center">
              <Mail className="size-3.5 text-white" />
            </div>
            <span className="text-sm font-bold">Career141</span>
          </div>
          <div className="ml-auto">
            <ThemeToggle className="size-8" />
          </div>
        </div>

        {/* Desktop top bar */}
        <div className="hidden md:block">
          <TopBar />
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
