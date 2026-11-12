import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

type DexAuthContextValue = {
  user: User | null;
  loading: boolean;
};

const DexAuthContext = createContext<DexAuthContextValue | null>(null);

export function DexAuthProvider({
  user,
  loading,
  children,
}: DexAuthContextValue & { children: ReactNode }) {
  return <DexAuthContext.Provider value={{ user, loading }}>{children}</DexAuthContext.Provider>;
}

export function useDexAuth(): DexAuthContextValue {
  const context = useContext(DexAuthContext);
  if (!context) throw new Error("useDexAuth must be used inside DexAuthProvider");
  return context;
}