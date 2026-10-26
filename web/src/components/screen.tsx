import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cx } from "./ui";

/**
 * Screen with an iOS large title that collapses into the inline glass bar on scroll.
 * `back` renders the back control (the browser/system back gesture keeps working).
 */
export function Screen({
  title,
  subtitle,
  back,
  onBack,
  actions,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const sentinel = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: "-52px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <div
        className={cx(
          "sticky top-[env(safe-area-inset-top,0px)] z-20 grid h-[52px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-[max(8px,env(safe-area-inset-left,0px))] transition-colors",
          collapsed ? "glass border-x-0 border-t-0" : "border-b border-transparent",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="focus-ring -ml-1 flex min-h-11 min-w-0 items-center gap-0.5 rounded-ctl pr-2 text-body text-accent"
            >
              <ChevronLeft size={26} strokeWidth={2.2} aria-hidden />
              <span className="truncate">{back ?? "Wstecz"}</span>
            </button>
          )}
        </div>
        <div
          aria-hidden={!collapsed}
          className={cx(
            "pointer-events-none max-w-[38vw] truncate text-headline transition-opacity lg:max-w-md",
            collapsed ? "opacity-100" : "opacity-0",
            !!actions && "max-sm:invisible",
          )}
        >
          {title}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1 pr-12 lg:pr-0">{actions}</div>
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-[max(16px,env(safe-area-inset-left,0px))] pb-32 pt-1 lg:px-8 lg:pb-16">
        <header className="flex flex-col gap-1">
          <h1 ref={sentinel} className="font-display text-large-title">
            {title}
          </h1>
          {subtitle && <div className="text-subhead text-fg-2">{subtitle}</div>}
        </header>
        {children}
      </main>

      {footer && (
        <div className="glass sticky bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-20 border-x-0 border-b-0 lg:bottom-0">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-[max(16px,env(safe-area-inset-left,0px))] py-3 lg:px-8">
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}
