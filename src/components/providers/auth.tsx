import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DummyUser = {
  id: string;
  profile: {
    name: string;
    email: string;
  };
};

type AuthContextValue = {
  user: DummyUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signin: (values: { email: string; password: string }) => Promise<void>;
  register: (values: { name: string; email: string; password: string }) => Promise<void>;
  signout: () => Promise<void>;
};

const STORAGE_KEY = "career141_dummy_user";
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DummyUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = window.localStorage.getItem(STORAGE_KEY);
    if (storedUser) {
      setUser(JSON.parse(storedUser) as DummyUser);
    }
    setIsLoading(false);
  }, []);

  const persistUser = useCallback((nextUser: DummyUser) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const signin = useCallback(
    async ({ email }: { email: string; password: string }) => {
      persistUser({
        id: "dummy-user",
        profile: {
          name: email.split("@")[0] || "Demo User",
          email,
        },
      });
    },
    [persistUser],
  );

  const register = useCallback(
    async ({ name, email }: { name: string; email: string; password: string }) => {
      persistUser({
        id: "dummy-user",
        profile: {
          name: name.trim() || "Demo User",
          email,
        },
      });
    },
    [persistUser],
  );

  const signout = useCallback(async () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      signin,
      register,
      signout,
    }),
    [isLoading, register, signin, signout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useUser() {
  const { user, isAuthenticated, isLoading } = useAuth();
  return (
    user ?? {
      id: undefined,
      name: undefined,
      email: undefined,
      avatar: undefined,
      isAuthenticated,
      isLoading,
      error: null,
    }
  );
}
