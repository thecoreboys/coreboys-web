"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Apple from "@/components/foundations/social-icons/apple";
import { useContributorLauncher } from "@/hooks/useContributorLauncher";
import { useDesktopUtilities } from "@/hooks/useDesktopUtilities";
import { useNativeApp } from "@/hooks/useNativeApp";
import { CORE_APP_STORE_URL } from "@/lib/mobile-app";
import styles from "./AppStoreDownload.module.css";

export function AppStoreDownload() {
  const nativeApp = useNativeApp();
  const desktop = useDesktopUtilities();
  return nativeApp === false && desktop ? <WebsiteAppStoreDownload /> : null;
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
      aria-label="CORE HQ for iPhone"
      data-floating-widget
      data-occluded={placement.hidden ? "true" : undefined}
      style={{ transform: `translateY(-${placement.lift}px)` }}
    >
      <a
        className={styles.badge}
        href={CORE_APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download CORE HQ on the App Store. Invite-only beta access required."
      >
        <Apple className={styles.apple} size={24} aria-hidden="true" />
        <span className={styles.label}>
          <span>Download on the</span>
          <strong>App Store</strong>
        </span>
      </a>
      <p className={styles.invite}>Invite-only beta. Access required.</p>
    </aside>
  );
}
