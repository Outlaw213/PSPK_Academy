import type { TaskType } from "../api/types";
import { useBlobUrl } from "../lib/useApi";
import { PhotoTile } from "./ui";

const placeholderMotif = { PRACTICAL: "hook", THEORY: "scroll", QUIZ: "fire", COURSE: "anvil" } as const;

/** A protected photo from the API (submission photo or reference photo), loaded with the token. */
export function ApiPhotoTile({
  path,
  label,
  className,
  onRemove,
  kind = "PRACTICAL",
}: {
  path: string | null;
  label?: string;
  className?: string;
  onRemove?: () => void;
  kind?: TaskType;
}) {
  const url = useBlobUrl(path);
  return (
    <PhotoTile
      photo={{ id: path ?? "none", tone: 28, motif: placeholderMotif[kind], url: url ?? undefined }}
      label={label}
      className={className}
      onRemove={onRemove}
    />
  );
}
