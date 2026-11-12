import Link from "next/link";
import { ArrowUpRight, MessageCircle, MonitorPlay } from "lucide-react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import Apple from "@/components/foundations/social-icons/apple";
import Image from "@/components/ui/SiteImage";
import { CORE_APP_ICON, CORE_APP_STORE_URL } from "@/lib/mobile-app";
import styles from "./MobileAppSection.module.css";

export function MobileAppSection() {
  return (
    <section id="core-hq-app" className={styles.section} aria-labelledby="mobile-app-heading">
      <div className={styles.card}>
        <Image
          className={styles.scene}
          src="/mobile-app/bedroom-scene.webp"
          alt=""
          fill
          sizes="(max-width: 767px) 100vw, 95vw"
          loading="lazy"
        />
        <div className={styles.pattern} aria-hidden="true" />

        <div className={styles.copy}>
          <div className={styles.appIdentity}>
            <Image src={CORE_APP_ICON} alt="" width={40} height={40} sizes="40px" />
            <span>CORE HQ <span className={styles.forIphone}>for iPhone</span></span>
            <Badge type="pill-color" color="gray" size="sm" className={styles.invite}>Invite Only</Badge>
          </div>

          <h2 id="mobile-app-heading" className={styles.heading}>
            Your desktop plays.<br />
            <span>Your phone calls<br className={styles.desktopBreak} /> the shots.</span>
          </h2>
          <p className={styles.description}>
            Keep Multiview on the big screen. Switch the main stream from your phone
            and keep every CORE chatroom in one place. All without leaving bed.
          </p>

          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}><MonitorPlay size={20} aria-hidden="true" /></span>
              <div>
                <h3>Your Multiview remote</h3>
                <p>Tap a creator on your phone. Change the main stream on your desktop.</p>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={`${styles.featureIcon} ${styles.chatIcon}`}><MessageCircle size={20} aria-hidden="true" /></span>
              <div>
                <h3>Every chat. One place.</h3>
                <p>Move between CORE chatrooms and stay in the conversation.</p>
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <Button
              className={styles.storeButton}
              href={CORE_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              color="secondary"
              size="lg"
              iconLeading={<Apple size={28} aria-hidden="true" />}
              aria-label="Download CORE HQ on the Apple App Store (Invite Only)"
              noTextPadding
            >
              <span className={styles.storeLabel}><span>Download on the</span><strong>App Store</strong></span>
            </Button>
            <Link href="/multiview/remote" prefetch={false} className={styles.remoteLink}>
              Explore the remote <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className={styles.accountNote}>Use the same CORE account on your phone and desktop.</p>
        </div>

        <figure className={styles.visual} aria-label="CORE HQ Multiview remote and live chat app preview">
          <div className={styles.phone}>
            <div className={styles.screen}>
              <Image
                className={styles.screenImage}
                src="/mobile-app/remote-preview.png"
                alt="The real CORE HQ remote interface: Windows PC connected, creator controls, and StableRonaldo live chat."
                fill
                sizes="(max-width: 767px) 235px, (max-width: 1100px) 250px, 290px"
                quality={90}
                loading="lazy"
              />
            </div>
            <Image
              className={styles.phoneFrame}
              src="/mobile-app/phone-frame.webp"
              alt=""
              width={720}
              height={960}
              sizes="(max-width: 767px) 440px, 540px"
              loading="lazy"
            />
          </div>
          <div className={styles.connected} aria-hidden="true">
            <span className={styles.connectedDot} /> Desktop connected
          </div>
        </figure>
      </div>
    </section>
  );
}
