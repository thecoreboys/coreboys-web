import type { Metadata } from "next";
import Image from "@/components/ui/SiteImage";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUpRight } from "lucide-react";
import { AutoLoopVideo } from "./AutoLoopVideo";
import { PanoramaViewer } from "./PanoramaViewer";
import { StoryProgress } from "./StoryProgress";
import styles from "./special-message.module.css";

export const metadata: Metadata = {
  title: "A Personal Message",
  description: "A letter from Michael about how he got started, why he built CORE Watch, and what he’d like to do with CORE.",
  alternates: { canonical: "/special-message" },
  openGraph: {
    title: "A Personal Message",
    description: "A letter from Michael about how he got started and why he built CORE Watch.",
    url: "/special-message",
    type: "article",
    images: [
      {
        url: "/special-message/core-huddle.webp",
        width: 1600,
        height: 1600,
        alt: "CORE members and friends looking down toward the camera.",
      },
    ],
  },
};

const creators = [
  {
    name: "PopularMMOs",
    href: "https://www.youtube.com/channel/UCpGdL9Sn3Q5YWUH2DVUW1Ug",
    image: "/special-message/popularmmos-profile.jpg",
  },
  {
    name: "GamingWithJen",
    href: "https://www.youtube.com/channel/UC_ItCy-BTDCULPpDPlieUKA",
    image: "/special-message/gamingwithjen-profile.jpg",
  },
] as const;

const videoIdeas = [
  "CORE science fair",
  "Go-kart soccer and bowling",
  "Dude Imperfect: Trying to break ridiculous world records",
  "The world’s biggest blanket fort at the CORE House",
  "CORE tries an American Ninja Warrior course",
  "Odd One Out: Who’s single?",
  "Odd One Out: Who’s a millionaire?",
];

const computerClips = [
  {
    src: "/special-message/evidence/pc-build-macro.mp4",
    poster: "/special-message/evidence/pc-build-open.webp",
    caption: "A closer look at the tubing",
  },
  {
    src: "/special-message/evidence/pc-build-tour.mp4",
    poster: "/special-message/evidence/pc-build-lit.webp",
    caption: "A tour of the finished PC",
  },
  {
    src: "/special-message/evidence/pc-build-red.mp4",
    poster: "/special-message/evidence/pc-build-red-poster.webp",
    caption: "The build with red lighting",
  },
] as const;

const siteScreens = [
  {
    title: "Home",
    src: "/special-message/app-screens/home.png",
    alt: "CORE Watch home page with a featured live stream.",
    description: "See who’s live, then browse Originals, clips, and posts.",
  },
  {
    title: "Guide",
    src: "/special-message/app-screens/guide.png",
    alt: "The Guide showing broadcasts and timeline filters.",
    description: "Find a stream or filter past shows by member, platform, or format.",
  },
  {
    title: "Theater",
    src: "/special-message/app-screens/now-playing-guide.png",
    alt: "Theater with Adapt’s stream and the chat panel open.",
    description: "Watch with chat and keep Up Next within reach.",
  },
  {
    title: "Community networks",
    src: "/special-message/app-screens/flock-network.png",
    alt: "The Flock Network page and its 24/7 programming.",
    description: "Each community has its own 24/7 channel and a place to catch up on its creators.",
  },
] as const;

export default function SpecialMessagePage() {
  return (
    <article id="special-message-top" className={styles.page}>
      <div className={styles.paper}>
        <header className={styles.frontPage}>
          <div className={styles.headlineCopy}>
            <p className={styles.byline}>A personal message from Michael</p>
            <h1>CORE, I&apos;d love to work with you.</h1>
            <p className={styles.lead}>
              I built CORE Watch because your streams helped me through some hard days.
              I wanted a place to find those streams and clips again. If you&apos;re working
              on the site or planning a shoot, I&apos;d like to help.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryLink} href="#beginning">Read my story <ArrowDown size={18} aria-hidden="true" /></a>
              <a className={styles.textLink} href="https://x.com/berryeyu" target="_blank" rel="noreferrer">Get in touch <ArrowUpRight size={18} aria-hidden="true" /></a>
            </div>
          </div>
          <figure className={styles.heroFigure}>
            <Image
              src="/special-message/core-huddle.webp"
              alt="CORE members and friends looking down toward the camera."
              width={1600}
              height={1600}
              sizes="(max-width: 760px) calc(100vw - 2rem), 42vw"
              priority
            />
          </figure>
        </header>

        <div id="story-timeline" className={styles.readingLayout}>
          <StoryProgress />

          <div className={styles.timelineMain}>
            <section id="beginning" data-step="01" className={styles.chapter}>
              <h2>A basketball team I made up</h2>
              <div className={styles.prose}>
                <p>
                  I was 11 when I got in trouble for trying to buy web hosting. I wanted to make
                  a ticket site for the Cranberry Crush, a basketball team I&apos;d made up.
                </p>
                <p>
                  The idea came from a Miami Heat game. My dad bought the tickets for Christmas
                  and my birthday, then found out the seller had scammed him. Somehow, it still
                  turned into a night I&apos;ll never forget. I met Udonis Haslem and shot free throws
                  after the game with Norris Cole and the Big Three (LeBron James, Dwyane Wade,
                  and Chris Bosh). I even got to hold championship rings. After that, I wanted
                  to build a ticket site of my own.
                </p>
                <p>
                  Around that time, I tried Minecraft on an iPad at a soccer field. Another kid&apos;s
                  dad had brought iPads for us to play on. I eventually got the PC version and
                  started moderating servers and building maps. When I wanted to change what the
                  game could do, I learned Java and started writing mods and plugins.
                </p>
              </div>
            </section>

            <section id="creator-work" data-step="02" className={styles.chapter}>
              <h2>Building for creators I grew up watching</h2>
              <div className={styles.prose}>
                <p>
                  That Minecraft work led to <a href="https://www.youtube.com/@Lubcubs" target="_blank" rel="noreferrer">Lubcubs Gaming</a>.
                  From 2018 to 2021, I also helped with projects for PopularMMOs, GamingWithJen,
                  and other creators I&apos;d watched growing up.
                </p>
                <p>
                  I worked behind the scenes. Someone would pitch a challenge or a hide-and-seek
                  game, and I&apos;d figure out how to make it work in Minecraft. I built maps, mods,
                  simulators, and tycoons. It was fun knowing something I made could become part
                  of a video I would&apos;ve watched as a kid.
                </p>
              </div>
              <div className={styles.creatorProfiles}>
                {creators.map((creator) => (
                  <a className={styles.creatorProfile} key={creator.name} href={creator.href} target="_blank" rel="noreferrer">
                    <Image src={creator.image} alt="" width={900} height={900} sizes="48px" />
                    <span>{creator.name}</span>
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </section>

            <section id="hard-years" data-step="03" className={styles.chapter}>
              <h2>When things got hard</h2>
              <div className={styles.prose}>
                <p>
                  COVID hit while I was in high school. After graduation, I moved away for college.
                  My parents divorced while I was still adjusting, and my health got worse.
                </p>
                <p>
                  I live with chronic anxiety and I&apos;m neurodivergent. For a while, even talking
                  to people felt harder than it used to. I lost a lot of confidence and didn&apos;t
                  know what I wanted to do next.
                </p>
                <p>
                  I kept working on projects when I had the energy. Some days that meant setting
                  up sound or lighting. Other days it meant editing footage, fixing a computer,
                  or writing code. Even when I had a hard time laughing myself, I still liked
                  making things that might make someone else laugh.
                </p>
              </div>
            </section>

            <section id="why-core" data-step="04" className={styles.chapter}>
              <h2>Why I built CORE Watch</h2>
              <div className={styles.prose}>
                <p>
                  On days when I woke up already tired, I&apos;d put on a CORE stream or replay a clip
                  that made me laugh. Sometimes that was the best part of my day.
                </p>
                <p>
                  I wanted a place where I could see who was live or find an old clip without
                  digging through different feeds. So I made one. The first site went offline on
                  July 31, 2026, when my college hosting credits with DigitalOcean expired.
                  I still wanted to use it, so I built it again. That&apos;s the site you&apos;re on now.
                </p>
              </div>
            </section>

            <section id="what-i-built" data-step="05" className={styles.chapter}>
              <h2>What I can help with</h2>
              <div className={styles.prose}>
                <p>
                  I recently finished my computer science degree. It&apos;s been tough looking
                  for work while AI is changing what companies hire for. I want to write
                  software and still get my hands on the equipment.
                </p>
                <p>
                  I build websites, full-stack apps, servers, and gaming PCs. On the production
                  side, I&apos;ve worked with Sony Alpha 7, FX3, and FX5 cameras, DJI drones and
                  wireless mics, RØDE and Shure gear, lighting, soundboards, and XLR cabling.
                  I&apos;ve streamed drone footage live. I also built my own server and tools for
                  bringing in footage from cameras.
                </p>
              </div>

              <PanoramaViewer />

              <div className={styles.ideasSection}>
                <h3>Videos I&apos;d pitch to CORE</h3>
                <ul className={styles.ideasList}>
                  {videoIdeas.map((idea) => <li key={idea}>{idea}</li>)}
                </ul>
              </div>
            </section>

            <section id="receipts" data-step="06" className={styles.chapter}>
              <h2>Some of my work</h2>

              <div className={styles.project}>
                <h3>A PC I built by hand</h3>
                <div className={styles.prose}>
                  <p>
                    I built this PC with a hardline water-cooling loop. That meant bending rigid
                    tubing to fit the case, routing the cables, and testing the loop for leaks.
                    If a bend didn&apos;t sit right, I made it again.
                  </p>
                </div>
                <div className={styles.computerPhotos}>
                  <Image
                    src="/special-message/evidence/pc-build-open.webp"
                    alt="The open PC during assembly, showing clear tubing and purple lighting."
                    width={1600}
                    height={1298}
                    sizes="(max-width: 560px) calc(100vw - 2rem), 42vw"
                  />
                  <Image
                    src="/special-message/evidence/pc-build-lit.webp"
                    alt="The finished water-cooled PC lit up behind its glass panel."
                    width={750}
                    height={1000}
                    sizes="(max-width: 560px) calc(100vw - 2rem), 25vw"
                  />
                </div>
                <div className={styles.filmRail} role="region" tabIndex={0} aria-label="Computer build videos">
                  {computerClips.map(({ src, poster, caption }) => (
                    <figure key={src}>
                      <AutoLoopVideo src={src} poster={poster} label={caption} />
                      <figcaption>{caption}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>

              <div className={styles.projectGrid}>
                <section className={styles.projectCard}>
                  <Image
                    src="/special-message/evidence/army-mercury.webp"
                    alt="Mercury project mark."
                    width={1400}
                    height={788}
                    sizes="(max-width: 640px) calc(100vw - 2rem), 42vw"
                  />
                  <div>
                    <h3>Mercury for the Army Reserve</h3>
                    <p>
                      Reservists had to navigate separate notifications, forms, and steps to get paid.
                      I built a web and mobile notification system, proposed a new interface, and
                      prototyped a way to automate the forms. The project sponsors adopted the design
                      direction, and the prototype showed how the paperwork could move faster.
                    </p>
                  </div>
                </section>

                <section className={styles.projectCard}>
                  <Image
                    src="/special-message/evidence/ucf-degree-redacted.webp"
                    alt="My University of Central Florida diploma with private details redacted."
                    width={1400}
                    height={1092}
                    sizes="(max-width: 640px) calc(100vw - 2rem), 42vw"
                  />
                  <div className={styles.degree}>
                    <Image src="/special-message/evidence/ucf-mark.webp" alt="" width={220} height={220} sizes="40px" />
                    <div>
                      <h3>B.S. in Computer Science</h3>
                      <p>University of Central Florida</p>
                    </div>
                  </div>
                </section>
              </div>

              <div className={styles.project}>
                <h3>A CORE video in Spanish</h3>
                <div className={styles.prose}>
                  <p>
                    I made a Spanish dub of a CORE backyard episode to see how the video could
                    be easier to follow for people who speak Spanish.
                  </p>
                </div>
                <video
                  className={styles.dubbingVideo}
                  aria-label="Spanish-language CORE backyard video demo"
                  controls
                  playsInline
                  preload="metadata"
                  poster="/special-message/evidence/core-backyard-dub-poster.webp"
                >
                  <source src="/special-message/evidence/core-backyard-es-dubbed.mp4" type="video/mp4" />
                  Your browser does not support this video.
                </video>
              </div>
            </section>

            <section id="platform-story" data-step="07" className={styles.chapter}>
              <h2>What you can find on CORE Watch</h2>
              <div className={styles.prose}>
                <p>
                  I built it for the moment you hear about a stream or a clip and want to find it.
                  I also wanted each member and their community to have a place of their own.
                </p>
              </div>
              <div className={styles.platformScreens}>
                {siteScreens.map(({ title, src, alt, description }) => (
                  <figure className={styles.platformScreen} key={title}>
                    <Image src={src} alt={alt} width={1265} height={710} sizes="(max-width: 640px) calc(100vw - 2rem), 42vw" />
                    <figcaption>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section id="thank-you" data-step="08" className={styles.chapter}>
              <h2>I wanted to say thank you.</h2>
              <div className={styles.prose}>
                <p>
                  To the CORE team and everyone watching, thanks for giving me something to
                  look forward to when I needed it. If this site helps someone find a stream
                  or a clip they&apos;d forgotten about, I&apos;m glad I made it.
                </p>
                <p>
                  “Create. Own. Run. Everything.” reminds me of being 11 and trying to get
                  the Cranberry Crush online. I still like taking an idea far enough to see
                  what it could become.
                </p>
                <p>
                  I&apos;d love to talk with Adapt, Woj, Bepsy, or anyone working on the site
                  or on production. If there&apos;s something I can help build or a shoot
                  I can help with, reach me on X at{" "}
                  <a href="https://x.com/berryeyu" target="_blank" rel="noreferrer">@berryeyu</a>.
                </p>
                <p className={styles.signature}>Michael</p>
              </div>
            </section>

            <footer className={styles.letterFooter}>
              <p>I built CORE Watch independently as a portfolio project. It is not affiliated with, or endorsed by, CORE or its members.</p>
              <div>
                <Link href="/"><ArrowLeft size={17} aria-hidden="true" /> Back to CORE</Link>
                <a href="#special-message-top">Back to the top</a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </article>
  );
}
