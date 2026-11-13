import { CoreLoadingMark } from "@/components/brand/CoreLoadingMark";
import styles from "./PageLoading.module.css";

/** A Suspense fallback: unmounts with the page, without a minimum duration. */
export function PageLoading({ label = "Loading page" }: { label?: string }) {
  return (
    <div className={styles.stage} role="status" aria-live="polite" aria-label={label} aria-busy="true">
      <CoreLoadingMark />
      <div className={styles.caption}>
        <span className={styles.track} aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}
