import { useEffect, useState, type ReactNode } from "react";

/** Render children only in the browser (after hydration).
    Polaris IndexTable uses useLayoutEffect, which logs a warning when rendered on the server. */
export function ClientOnly({ children, fallback = null }: { children: () => ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children() : fallback}</>;
}
