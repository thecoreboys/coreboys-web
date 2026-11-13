import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Image from "@/components/ui/SiteImage";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUpRight } from "lucide-react";
import { AutoLoopVideo } from "./AutoLoopVideo";
import { PanoramaViewer } from "./PanoramaViewer";
import { StoryProgress } from "./StoryProgress";
import { FeatureIllustration, type FeatureKind } from "./FeatureIllustration";
import styles from "./special-message.module.css";

export const metadata: Metadata = withPageMetadata("/special-message", {
  title: "A personal message from the creator of the site",
  description: "A personal message from Michael, the creator of this independent CORE fan site, about his story, creative and technical work, and the people who inspired it.",
  alternates: { canonical: "/special-message" },
  openGraph: { type: "article" },
});

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
  { title: "CORE science fair", image: "/special-message/ideas/science-fair.webp" },
  { title: "Go-kart soccer and bowling", image: "/special-message/ideas/kart-challenges.webp" },
  { title: "Dude Imperfect: Trying to break ridiculous world records", image: "/special-message/ideas/world-records.webp" },
  { title: "The world’s biggest blanket fort at the CORE House", image: "/special-message/ideas/blanket-fort.webp" },
  { title: "CORE tries an American Ninja Warrior course", image: "/special-message/ideas/ninja.webp" },
  { title: "Odd One Out: Who’s single?", image: "/special-message/ideas/single.webp" },
  { title: "Odd One Out: Who’s a millionaire?", image: "/special-message/ideas/millionaire.webp" },
] as const;

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

type SiteFeature = {
  title: string;
  illustration: FeatureKind;
  description: string;
};

const siteFeatures: SiteFeature[] = [
  {
    title: "Home",
    illustration: "home",
    description: "See who’s live and discover streams, Originals, clips, and posts from the members and their communities in one place.",
  },
  {
    title: "Guide",
    illustration: "guide",
    description: "Browse live broadcasts and 24/7 schedules, or find past shows by member, platform, and format.",
  },
  {
    title: "Theater",
    illustration: "theater",
    description: "Give a stream or video the main stage, follow its chat, and keep the next thing to watch within reach.",
  },
  {
    title: "Networks",
    illustration: "networks",
    description: "Explore each community’s own channel, with 24/7 programming and a place to catch up on its creators.",
  },
  {
    title: "On Screen Detection",
    illustration: "detection",
    description: "See identity tags for the creators appearing on supported streams and replays, with links to their profiles.",
  },
  {
    title: "Multiviewing",
    illustration: "multiview",
    description: "Watch several streams together, arrange the view, and choose which source takes the main stage and plays audio.",
  },
  {
    title: "Remote Control",
    illustration: "remote",
    description: "Pair your phone with your computer to switch the main source and control playback. The remote chat follows the channel you’re watching.",
  },
];

export default function SpecialMessagePage() {
  return (
    <article id="special-message-top" className={styles.page}>
      <div className={styles.paper}>
        <header className={styles.frontPage}>
          <div className={styles.headlineCopy}>
            <p className={styles.byline}>From Michael</p>
            <h1>A personal message from the creator of the site</h1>
            <p className={styles.lead}>
              I built this site because CORE&apos;s streams helped me through some difficult days.
              This is the story behind it, the work I love doing, and what I hope to build next.
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
                  and Chris Bosh). I even got to hold championship rings.
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
                  I worked behind the scenes. Someone would pitch a challenge or a wild, wacky
                  video idea, and I&apos;d figure out how to make it work in Minecraft. I built maps, mods,
                  simulators, and tycoons, including work on some of the most iconic series in
                  Minecraft gaming history: Hide and Seek, Challenge Games, and Mob Battles.
                  It was fun knowing something I made could become part of a video I would&apos;ve
                  watched as a kid.
                </p>
                <p>
                  I wanted those maps to put smiles on people&apos;s faces, whether they were
                  watching before school or after finishing homework. Just as the creators put
                  their own personalities into the recordings their audiences love, I put mine
                  into the work behind the scenes, with creativity and easter eggs throughout.
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
                  COVID hit while I was in high school, and I was also dealing with a toxic
                  environment at home. After graduation, I moved away for college.
                  My parents divorced while I was still adjusting, and my health got worse.
                </p>
                <p>
                  I live with anxiety, and neurodiversity is part of my story too. These
                  experiences look different for everyone. For a while, even talking to people
                  felt harder than it used to. I lost a lot of confidence and didn&apos;t know
                  what I wanted to do next.
                </p>
                <p>
                  My support system failed me when I needed it, and relying on friends and
                  family was hard. Even then, I still had God, myself, and the will to keep
                  pushing. I kept going, and that same faith and determination keep me moving
                  forward today.
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
              <h2>Why I built this site</h2>
              <div className={styles.prose}>
                <p>
                  I look forward to the “cringy” entertainment Twitch has to offer, and maybe
                  many of you reading this do too. After a long day at school or work, many
                  of us end the day sharing a laugh with our favorite creators or Twitch streamers.
                </p>
                <p>
                  Six different communities have come together to create CORE, bringing
                  a gigantic audience with them.
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
              <p className={styles.sectionLabel}>A technical message</p>
              <h2>What I can help with</h2>
              <div className={styles.prose}>
                <p>
                  I recently finished my computer science degree. It&apos;s been tough looking
                  for work while AI is changing what companies hire for. I want to write
                  software, get my hands on the equipment, and work with creators on digital
                  entertainment, events, and logistics.
                </p>
                <p>
                  I build websites, full-stack apps, servers, and gaming PCs. On the production
                  side, I&apos;ve worked with Sony Alpha 7, FX3, and FX5 cameras, DJI drones and
                  wireless mics, RØDE and Shure gear, lighting, and soundboards.
                  I&apos;ve spent far too much of my own money on technology along the way.
                </p>
                <p>
                  I also built my own server and tools for bringing in footage from cameras,
                  including an IRL Toolkit alternative as a backup during downtime. I create
                  custom stream overlays that moderators can control through a website or
                  Twitch chat commands.
                </p>
              </div>

              <PanoramaViewer />

              <div className={styles.ideasIntro}>
                <h3>Let&apos;s bring your ideas to life.</h3>
                <p>
                  Let&apos;s plan and execute them together. I can be another pair of hands
                  for the logistics and all the work that makes an idea happen.
                </p>
              </div>
              <ul className={styles.ideaThumbnails} aria-label="Video ideas">
                {videoIdeas.map(({ title, image }) => (
                  <li key={image}>
                    <Image
                      src={image}
                      alt={`${title} video thumbnail`}
                      width={1200}
                      height={675}
                      sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 900px) calc(50vw - 2rem), 28rem"
                    />
                  </li>
                ))}
              </ul>
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
                      I was part of the team behind Mercury for the Army Reserve, helping reservists
                      navigate notifications, forms, and the steps needed to get paid. I spearheaded
                      the web and mobile notification system, led the new interface design, and
                      prototyped a way to automate the forms. The project sponsors adopted the design
                      direction, and our prototype showed how the paperwork could move faster.
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
              <h2>What you can find on CORE</h2>
              <div className={styles.prose}>
                <p>
                  I wanted this site to make it easier to discover something to watch, keep up
                  with each community, and choose how you watch. These are some of the features
                  I&apos;ve built into it.
                </p>
              </div>
              <div className={styles.platformScreens}>
                {siteFeatures.map(({ title, illustration, description }) => (
                  <figure className={styles.platformScreen} key={title}>
                    <div className={styles.featureArt}><FeatureIllustration kind={illustration} /></div>
                    <figcaption>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section id="why-im-different" data-step="08" className={styles.chapter}>
              <h2>Why I&apos;m different</h2>
              <div className={styles.prose}>
                <p>
                  I take initiative, solve problems, adapt, and keep learning. I understand the
                  game because I love it. My experience brings together engineering, computers,
                  technical production, coding, scripting, planning, and execution, with an
                  entrepreneurial mindset.
                </p>
                <p>
                  My technical creativity is what connects all of it. I love developing ideas
                  of my own and bringing other people&apos;s ideas to fruition. I care about the
                  work behind the idea, all the way through to making it happen.
                </p>
                <p>
                  I use the STAR method (Situation, Task, Action, Result). For me, it&apos;s STARR,
                  because I add another R: Reflect. I take time afterward to understand what
                  I did well, what I did badly, and how I can improve next time. Even my best
                  work gives me something to learn from.
                </p>
                <p>
                  To me, this goes beyond being a coworker or a fan. I&apos;m a trustworthy, loyal
                  person who cares about the people and work I commit to. When I say I will do
                  something, I will do it. I am a man of my word, and I keep my word.
                </p>
              </div>
            </section>

            <section id="thank-you" data-step="09" className={styles.chapter}>
              <h2>I wanted to say thank you.</h2>
              <div className={styles.prose}>
                <p>
                  To CORE: thank you for giving me something to look forward to when I needed it.
                  And to everyone reading, thank you for giving my story your time. If this site
                  helps someone find a stream or a clip they&apos;d forgotten about, I&apos;m glad I made it.
                </p>
                <p>
                  “Create. Own. Run. Everything.” reminds me of being 11 and trying to get
                  the Cranberry Crush online. I still like taking an idea far enough to see
                  what it could become.
                </p>
                <p>
                  I&apos;m struggling right now, and I want to be honest about that. Side work,
                  trial work, or a permanent role would all be greatly appreciated. If a colleague
                  or friend needs a hardworking, dedicated person who gives 110%, a recommendation
                  would mean a lot.
                </p>
                <p>
                  I have the will to learn whatever the work needs. If you ask for something
                  and there&apos;s no plan and no one knows how to get it done, I will figure out
                  how. I want to be the problem solver you can count on. I will exceed all
                  expectations, go above and beyond, and keep finding ways to improve even
                  my best work.
                </p>
                <p>
                  I&apos;d love to talk with{" "}
                  <Link className={styles.mention} href="/about/adapt">@Adapt</Link>,{" "}
                  <Link className={styles.mention} href="/crew/wojito">@Woj</Link>,{" "}
                  <Link className={styles.mention} href="/crew/bepsy">@Bepsy</Link>, or anyone who could use help with
                  software, production, or bringing an idea to life. You can reach me on X at{" "}
                  <a href="https://x.com/berryeyu" target="_blank" rel="noreferrer">@berryeyu</a>.
                </p>
                <p className={styles.signature}>Michael</p>
              </div>
            </section>

            <footer className={styles.letterFooter}>
              <p>I built this site independently as a portfolio project. It is not affiliated with, or endorsed by, CORE or its members.</p>
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
