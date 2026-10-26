import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  Anchor,
  Check,
  ChevronRight,
  Clock,
  Flame,
  Hammer,
  Heart,
  Leaf,
  Lock,
  Pencil,
  RotateCcw,
  Spline,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Photo, TaskStatus } from "../mock/data";
import { taskStatus, type Tone } from "../lib/status";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

const toneClass: Record<Tone, string> = {
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/14 text-warn",
  bad: "bg-bad/12 text-bad",
  info: "bg-info/12 text-info",
  accent: "bg-accent/14 text-accent",
  brand: "bg-brand-soft/14 text-brand",
  muted: "bg-fg/[0.06] text-fg-2",
};

export function Badge({ tone, children, icon: Icon }: { tone: Tone; children: ReactNode; icon?: LucideIcon }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold", toneClass[tone])}>
      {Icon && <Icon size={13} strokeWidth={2.4} aria-hidden />}
      {children}
    </span>
  );
}

const statusIcon: Record<TaskStatus, LucideIcon> = {
  LOCKED: Lock,
  AVAILABLE: Zap,
  IN_PROGRESS: Pencil,
  SUBMITTED: Clock,
  UNDER_REVIEW: Clock,
  NEEDS_IMPROVEMENT: RotateCcw,
  PASSED: Check,
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const s = taskStatus[status];
  return (
    <Badge tone={s.tone} icon={statusIcon[status]}>
      {s.label}
    </Badge>
  );
}

/** Round status glyph for list rows: state shown by icon + colour + text label nearby. */
export function StatusDot({ status }: { status: TaskStatus }) {
  const s = taskStatus[status];
  const Icon = statusIcon[status];
  return (
    <span
      className={cx(
        "grid size-9 shrink-0 place-items-center rounded-full",
        status === "PASSED" ? "bg-ok text-bg-2" : toneClass[s.tone],
      )}
      aria-hidden
    >
      <Icon size={17} strokeWidth={2.4} />
    </span>
  );
}

type Variant = "prominent" | "bordered" | "plain" | "destructive";

export function Button({
  variant = "prominent",
  size = "md",
  className,
  icon: Icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "lg"; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-ctl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        size === "lg" ? "px-5 text-body" : "px-4 text-subhead",
        variant === "prominent" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "bordered" && "bg-accent/12 text-accent hover:bg-accent/18",
        variant === "plain" && "text-accent hover:bg-accent/8",
        variant === "destructive" && "bg-bad/12 text-bad hover:bg-bad/18",
        className,
      )}
    >
      {Icon && <Icon size={18} strokeWidth={2.2} aria-hidden />}
      {children}
    </button>
  );
}

/** Inset-grouped container (iOS list style). */
export function Group({ title, footer, children, className }: { title?: string; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col gap-2", className)}>
      {title && <h3 className="px-4 text-footnote font-semibold uppercase tracking-[0.06em] text-fg-3">{title}</h3>}
      <div className="overflow-hidden rounded-card bg-bg-2">{children}</div>
      {footer && <p className="px-4 text-footnote text-fg-3">{footer}</p>}
    </section>
  );
}

export function Row({
  children,
  onClick,
  leading,
  trailing,
  chevron = !!onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1 py-3">{children}</div>
      {trailing}
      {chevron && <ChevronRight size={18} className="shrink-0 text-fg-3" aria-hidden />}
    </>
  );
  const base = "flex min-h-11 w-full items-center gap-3 px-4 text-left [&+&]:border-t hairline";
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={cx(base, "focus-ring transition hover:bg-fg/[0.03] active:bg-fg/[0.06]")}>
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  );
}

const motifIcon: Record<Photo["motif"], LucideIcon> = {
  hook: Anchor,
  nail: Hammer,
  scroll: Spline,
  tongs: Wrench,
  fire: Flame,
  anvil: Hammer,
  heart: Heart,
  leaf: Leaf,
};

/** Placeholder for a real submission photo: a heat-coloured steel swatch. */
export function PhotoTile({ photo, className, onRemove, label }: { photo: Photo; className?: string; onRemove?: () => void; label?: string }) {
  const Icon = motifIcon[photo.motif];
  return (
    <div className={cx("relative aspect-square max-w-full overflow-hidden rounded-[14px]", className)}>
      {photo.url ? (
        <img src={photo.url} alt={label ?? "Zdjęcie"} className="size-full object-cover" />
      ) : (
        <div
          role="img"
          aria-label={label ?? "Zdjęcie przykładowe"}
          className="grid size-full place-items-center"
          style={{
            background: `radial-gradient(120% 90% at 30% 80%, hsl(${photo.tone} 95% 52% / 0.85), transparent 55%), linear-gradient(160deg, hsl(30 6% 30%), hsl(30 5% 12%))`,
          }}
        >
          <Icon className="text-white/80 drop-shadow" size={34} strokeWidth={1.6} aria-hidden />
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Usuń zdjęcie"
          className="focus-ring absolute right-1 top-1 grid size-11 place-items-center"
        >
          <span className="grid size-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur">
            <X size={15} strokeWidth={2.6} />
          </span>
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-1 text-footnote font-semibold text-fg-2">
        {label}
      </label>
      {children(id)}
      {error ? <p className="px-1 text-footnote text-bad">{error}</p> : hint && <p className="px-1 text-footnote text-fg-3">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "focus-ring w-full rounded-ctl bg-bg-3/70 px-4 py-3 text-body text-fg placeholder:text-fg-3 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad/60";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[10px] bg-fg/[0.07] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "focus-ring min-h-9 flex-1 rounded-[8px] px-3 text-footnote font-semibold transition",
            value === o.value ? "bg-bg-2 text-fg shadow-sm" : "text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-fg/[0.08]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`Ukończono ${done} z ${total}`}
    >
      <div className="h-full rounded-full bg-brand-soft transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
    </div>
  );
}

/** Modal sheet: bottom sheet on phones, centred card on wider screens. Always closable. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-full rounded-t-[28px] bg-bg p-0 text-fg backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg sm:rounded-[28px]"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-headline">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="focus-ring grid size-11 place-items-center rounded-full">
            <span className="grid size-8 place-items-center rounded-full bg-fg/[0.08] text-fg-2">
              <X size={16} strokeWidth={2.6} />
            </span>
          </button>
        </header>
        <div className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
      {message && (
        <div className="glass flex items-center gap-2 rounded-full px-5 py-3 text-subhead font-semibold shadow-lg">
          <Check size={17} className="text-ok" strokeWidth={2.6} aria-hidden />
          {message}
        </div>
      )}
    </div>
  );
}

export { cx };
