"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import Apple from "@/components/foundations/social-icons/apple";
import Image from "@/components/ui/SiteImage";
import { useContributorLauncher } from "@/hooks/useContributorLauncher";
import styles from "./AppStoreDownload.module.css";

const APP_STORE_URL = "https://apps.apple.com/app/id6833178116";

export function AppStoreDownload() {
  const pathname = usePathname();
  const { ref, placement } = useContributorLauncher<HTMLElement>(pathname);

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/studio") || pathname?.startsWith("/access")) return null;

  return (
    <aside
      ref={ref}
      className={styles.download}
      aria-label="Download CORE HQ"
      data-floating-widget
      data-occluded={placement.hidden ? "true" : undefined}
      style={{ transform: `translateY(-${placement.lift}px)` }}
    >
      <Image
        className={styles.appIcon}
        src="/brand/core-hq-app-icon.webp"
        alt="CORE HQ app icon"
        width={56}
        height={56}
        sizes="56px"
      />
      <Button
        className={styles.badge}
        color="secondary"
        size="sm"
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download CORE HQ on the Apple App Store (Invite Only)"
        iconLeading={<Apple className={styles.apple} size={28} aria-hidden="true" />}
        noTextPadding
      >
        <span className={styles.label}>
          <span>Download on the</span>
          <strong>Apple App Store</strong>
        </span>
      </Button>
      <Badge className={styles.invite} type="pill-color" color="gray" size="sm">Invite Only</Badge>
    </aside>
  );
}
