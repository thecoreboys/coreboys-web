"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import Apple from "@/components/foundations/social-icons/apple";
import Image from "@/components/ui/SiteImage";
import { useContributorLauncher } from "@/hooks/useContributorLauncher";
import { useNativeApp } from "@/hooks/useNativeApp";
import { CORE_APP_ICON, CORE_APP_STORE_URL } from "@/lib/mobile-app";
import styles from "./AppStoreDownload.module.css";

export function AppStoreDownload() {
  const nativeApp = useNativeApp();
  return nativeApp === false ? <WebsiteAppStoreDownload /> : null;
}

function WebsiteAppStoreDownload() {
  const pathname = usePathname();
  const { ref, placement } = useContributorLauncher<HTMLElement>(pathname);
  const [homePromotionVisible, setHomePromotionVisible] = useState(false);

  useEffect(() => {
    if (pathname !== "/") return;
    let observer: IntersectionObserver | undefined;
    const pending = new MutationObserver(observePromotion);
    function observePromotion() {
      const promotion = document.getElementById("core-hq-app");
      if (!promotion || observer) return;
      pending.disconnect();
      observer = new IntersectionObserver(([entry]) => {
        setHomePromotionVisible(Boolean(entry?.isIntersecting));
      }, { rootMargin: "-15% 0px -15% 0px", threshold: .2 });
      observer.observe(promotion);
    }
    observePromotion();
    if (!observer) pending.observe(document.body, { childList: true, subtree: true });
    return () => { pending.disconnect(); observer?.disconnect(); };
  }, [pathname]);

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/studio") || pathname?.startsWith("/access")) return null;

  return (
    <aside
      ref={ref}
      className={`${styles.download}${pathname === "/" && homePromotionVisible ? ` ${styles.promotionVisible}` : ""}`}
      aria-label="Download CORE HQ"
      data-floating-widget
      data-occluded={placement.hidden ? "true" : undefined}
      style={{ transform: `translateY(-${placement.lift}px)` }}
    >
      <Image
        className={styles.appIcon}
        src={CORE_APP_ICON}
        alt="CORE HQ app icon"
        width={56}
        height={56}
        sizes="56px"
      />
      <Button
        className={styles.badge}
        color="secondary"
        size="sm"
        href={CORE_APP_STORE_URL}
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
