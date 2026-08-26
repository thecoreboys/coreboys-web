import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AutoLoopVideo } from "./AutoLoopVideo";
import { PanoramaViewer } from "./PanoramaViewer";
import { StoryProgress } from "./StoryProgress";
import styles from "./special-message.module.css";

export const metadata: Metadata = {
  title: "A Special Message",
  description:
    "A personal letter about code, creative production, the story behind Coreboys, and a site built to contribute something meaningful.",
  alternates: { canonical: "/special-message" },
  openGraph: {
    title: "A Special Message",
    description:
      "An open letter about the story behind this site, the people who inspired it, and why I wanted to contribute it.",
    url: "/special-message",
    type: "article",
    images: [
      {
        url: "/special-message/evidence/origin-storyboard-v2.webp",
        width: 1823,
        height: 1025,
        alt: "Four panels showing code, audio equipment, a control desk, and a live production.",
      },
    ],
  },
};

const toolkit = [
  {
    number: "01",
    title: "Software & Engineering",
    body: "I build full-stack products, custom Java mods and plugins, and the systems behind streaming and digital experiences. I like taking a messy idea and making it dependable.",
  },
  {
    number: "02",
    title: "Production & A/V",
    body: "I have worked with cameras, lenses, lighting, soundboards, live events, microphones, editing, and the Adobe suite. I understand both the creative idea and the technical setup it needs.",
  },
  {
    number: "03",
    title: "Hardware & IT",
    body: "I build hardline water-cooled computers, fly FAA-registered drones, troubleshoot technical problems, and keep learning until the whole system works—not just one part of it.",
  },
] as const;

const chapterLinks = [
  ["01", "How I started", "#beginning"],
  ["02", "Creator years", "#creator-work"],
  ["03", "The hard years", "#hard-years"],
  ["04", "Why CORE", "#why-core"],
  ["05", "What I built", "#what-i-built"],
  ["06", "Thank you", "#thank-you"],
] as const;

const creatorCircle = [
  ["Lubcubs Gaming", "Gaming studio"],
  ["SSundee", "Gaming creator"],
  ["TommyInnit", "Minecraft creator"],
  ["Unspeakable", "Gaming creator"],
  ["Gavin", "Gaming creator"],
  ["Nico", "Gaming creator"],
  ["Slogo", "Gaming creator"],
  ["MooseCraft", "Gaming creator"],
  ["PokeFind", "Minecraft server"],
  ["Plixel", "Minecraft server"],
  ["BeckBroJack", "Minecraft creator"],
  ["Ccrizzic", "Gaming creator"],
  ["Cash", "Gaming creator"],
  ["100 Media", "Development team"],
  ["TubNet", "Minecraft server"],
  ["Shark", "Gaming creator"],
  ["Stroie", "Gaming creator"],
  ["Bendie", "Gaming creator"],
  ["Crainer", "Gaming creator"],
  ["Lynixity", "Gaming creator"],
  ["TheaGaming", "Gaming creator"],
  ["Jelly", "Gaming creator"],
  ["DoctorBenx", "Gaming creator"],
  ["EpicStun", "Gaming creator"],
  ["Army Reserve", "Organization"],
  ["IBM", "Technology partner"],
] as const;

export default function SpecialMessagePage() {
  return (
    <>
      <article id="special-message-top" className={styles.page}>
        <StoryProgress />
        <div className={styles.paper}>
          <header className={styles.frontPage}>
            <div className={styles.issueBar}>
              <span>Special edition</span>
              <span>For the CORE team, community &amp; everyone reading</span>
              <time dateTime="2026-08">August 2026</time>
            </div>

            <div className={styles.masthead}>
              <span className={styles.mastheadMark} aria-hidden="true">
                C
              </span>
              <p className={styles.mastheadTitle}>The Coreboys Record</p>
              <p className={styles.editionNumber}>Vol. 02 / Built with purpose</p>
            </div>

            <div className={styles.headlineGrid}>
              <div className={styles.headlineCopy}>
                <p className={styles.eyebrow}>A personal letter, shared openly</p>
                <h1>CORE gave me something to look forward to.</h1>
                <p className={styles.dek}>
                  The streams, videos, and community put a smile on my face and made me laugh,
                  even during the darkest times. This website is my way of saying thank you. I
                  want to share where I came from, why that work mattered to me, and why I
                  spent so much time building something for this community.
                </p>
                <div className={styles.byline}>
                  <span>Written honestly</span>
                  <span>Built with gratitude</span>
                </div>
              </div>

              <aside className={styles.frontPageAside} aria-label="Edition note">
                <div className={styles.stamp}>
                  <span>One story</span>
                  <strong>Read straight down</strong>
                </div>
              </aside>
            </div>
          </header>

          <figure className={styles.heroFigure}>
            <Image
              className={styles.heroImage}
              src="/special-message/evidence/origin-storyboard-v2.webp"
              alt="A tactile four-panel storyboard showing the author learning to code, creating a block world with friends, designing systems beside his custom water-cooled computer, and operating a live production console."
              width={1823}
              height={1025}
              sizes="100vw"
              priority
            />
            <ol className={styles.heroPanelNotes} aria-label="What each origin-story panel shows">
              <li>
                <span>01</span>
                <p>Nerding out about technology</p>
              </li>
              <li>
                <span>02</span>
                <p>Playing Minecraft with friends</p>
              </li>
              <li>
                <span>03</span>
                <p>Designing custom desktops</p>
              </li>
              <li>
                <span>04</span>
                <p>BTS production</p>
              </li>
            </ol>
            <figcaption className={styles.heroCaption}>
              <span>Origin story</span>
              <p>
                This begins when I was 11 and ends with the site in front of you now.
                Everything is here in the order it happened.
              </p>
            </figcaption>
          </figure>

          <nav className={styles.chapterNav} aria-label="Message chapters">
            {chapterLinks.map(([number, label, href]) => (
              <a href={href} key={href}>
                <span>{number}</span>
                {label}
              </a>
            ))}
          </nav>

          <section id="beginning" className={styles.chapter}>
            <div className={styles.chapterLabel}>
              <span>Part 01 / Age 11</span>
              <p>How I started</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>The beginning</p>
              <h2>I was always the kid behind the scenes.</h2>
              <p className={styles.dropCap}>
                I started programming when I was 11. One of my first big ideas was trying to
                buy web hosting so I could sell tickets to my own knock-off basketball team,
                the Cranberry Crush. I got in trouble for the hosting part, but the instinct
                behind it never really left me.
              </p>
              <p>
                Not long after that, I started playing Minecraft on an iPad with friends. I
                went from playing the game to making maps, learning Java, and building mods
                and plugins. I loved the feeling of taking something that only existed in my
                head and turning it into something other people could use and enjoy.
              </p>
            </div>

            <aside className={styles.marginFile}>
              <span className={styles.marginFileKicker}>Age 11 / first build</span>
              <strong>Cranberry Crush</strong>
              <p>
                A made-up basketball team, a real website plan, and the first time I learned
                an idea could become something people joined.
              </p>
              <span className={styles.redUnderline}>The first spark</span>
            </aside>
          </section>

          <section id="creator-work" className={`${styles.chapter} ${styles.creatorChapter}`}>
            <div className={styles.chapterLabel}>
              <span>Part 02 / 2018—21</span>
              <p>The creator years</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>Minecraft opened a real door</p>
              <h2>I got to build for creators I had grown up watching.</h2>
              <p>
                That Minecraft work led me to{" "}
                <a
                  className={styles.creatorInlineLink}
                  href="https://www.youtube.com/@Lubcubs"
                  target="_blank"
                  rel="noreferrer"
                >
                  Lubcubs Gaming
                </a>
                . From 2018 through 2021, I helped make projects for{" "}
                <a
                  className={styles.creatorInlineLink}
                  href="https://www.youtube.com/channel/UCpGdL9Sn3Q5YWUH2DVUW1Ug"
                  target="_blank"
                  rel="noreferrer"
                >
                  PopularMMOs
                </a>
                ,{" "}
                <a
                  className={styles.creatorInlineLink}
                  href="https://www.youtube.com/channel/UC_ItCy-BTDCULPpDPlieUKA"
                  target="_blank"
                  rel="noreferrer"
                >
                  GamingWithJen
                </a>
                , and other creators whose work had shaped a lot of childhoods.
              </p>
              <p>
                I was happiest behind the scenes. Someone would bring in a weird or funny
                idea, and I would figure out the Java, maps, mods, or plugins needed to make
                it real. That taught me that I did not need to be the person in front of the
                camera to help create something an audience remembers.
              </p>

              <div className={styles.creatorProfiles} aria-label="Creators I worked for">
                <a
                  className={styles.creatorProfile}
                  href="https://www.youtube.com/channel/UCpGdL9Sn3Q5YWUH2DVUW1Ug"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Image
                    className={styles.creatorAvatar}
                    src="/special-message/popularmmos-profile.jpg"
                    alt="PopularMMOs official YouTube profile picture"
                    width={900}
                    height={900}
                    sizes="80px"
                  />
                  <span>
                    <small>Creator work / 2018—21</small>
                    <strong>PopularMMOs</strong>
                    <em>Official channel ↗</em>
                  </span>
                </a>

                <a
                  className={styles.creatorProfile}
                  href="https://www.youtube.com/channel/UC_ItCy-BTDCULPpDPlieUKA"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Image
                    className={styles.creatorAvatar}
                    src="/special-message/gamingwithjen-profile.jpg"
                    alt="GamingWithJen official YouTube profile picture"
                    width={900}
                    height={900}
                    sizes="80px"
                  />
                  <span>
                    <small>Creator work / 2018—21</small>
                    <strong>GamingWithJen</strong>
                    <em>Official channel ↗</em>
                  </span>
                </a>
              </div>

              <section className={styles.creatorCircle} aria-labelledby="creator-circle-heading">
                <div className={styles.creatorCircleHeading}>
                  <span>Creator &amp; project circle</span>
                  <h3 id="creator-circle-heading">The wider world around the work.</h3>
                  <p>
                    Separate from the two featured channels above, these are the creators,
                    studios, servers, and teams that belong to this chapter of the story.
                  </p>
                </div>

                <ul>
                  {creatorCircle.map(([name, type]) => (
                    <li key={name}>
                      <strong>{name}</strong>
                      <span>{type}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className={styles.marginFile}>
              <span className={styles.marginFileKicker}>What changed</span>
              <strong>Player → builder</strong>
              <p>The game I loved became the place where technical work met an audience.</p>
              <a
                className={styles.redUnderline}
                href="https://www.youtube.com/@Lubcubs"
                target="_blank"
                rel="noreferrer"
              >
                Lubcubs Gaming
              </a>
            </aside>
          </section>

          <section id="hard-years" className={`${styles.chapter} ${styles.chapterDark}`}>
            <div className={styles.chapterLabel}>
              <span>Part 03 / 2020—college</span>
              <p>The hard years</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>This is the order it happened</p>
              <h2>Then I stopped feeling like myself for a while.</h2>
              <p>
                First, COVID hit while I was still in high school. After high school, I moved
                away to college. Then, while I was trying to adjust to college and adulthood,
                my parents divorced.
              </p>
              <p>
                It was a lot of change close together. I live with chronic anxiety, and even
                as a neurotypical person, those years made it hard to feel grounded. My
                confidence took a real hit, communication became even harder, and there were
                long stretches where I felt stuck and unsure of what I was supposed to do next.
              </p>
              <p>
                I kept building when I could. I worked behind the scenes on productions,
                learned more about cameras, lighting, audio, and editing, and tried to hold
                on to the part of me that still wanted to make things.
              </p>
            </div>

            <blockquote className={styles.pullQuote}>
              <span aria-hidden="true">“</span>
              <p>When it was hard to smile, my goal shifted: how could I make others smile?</p>
            </blockquote>
          </section>

          <div className={styles.resetPause} aria-label="Chapter transition">
            <span>Then I found a reason to build again</span>
            <strong>That is where CORE enters this story.</strong>
          </div>

          <section id="why-core" className={styles.chapter}>
            <div className={styles.chapterLabel}>
              <span>Part 04 / College—now</span>
              <p>Why CORE mattered</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>The honest reason for this website</p>
              <h2>CORE made the days I felt most alone feel less lonely.</h2>
              <p className={styles.dropCap}>
                There are days when people go through the motions but do not feel connected to
                their own lives. During those years, CORE was something I could come back to.
                The streams gave me something to look forward to, a reason to laugh when I
                had not had much to laugh about, and a reminder that the day did not have to
                end the way it started.
              </p>
              <p>
                Some readers may know that feeling too: scrolling because the quiet feels too
                loud, then finding one stream, one clip, or one dumb joke that pulls them back
                into the room. It can look small from the outside, but it can change how a hard
                day ends. Creative work reaches people in ways its makers may never get to see.
              </p>
              <p>
                That is why I wanted to give some of that energy back. I did not want to
                just say this community helped me; I wanted to build something that made the
                streams, clips, creator information, and memories easier to come back to.
              </p>
              <p>
                When V1 went offline on July 31, 2026, I had a choice: let the idea disappear
                with it, or build it again with more care. I chose to rebuild it. The site on
                this page is V2.
              </p>
            </div>

            <aside className={styles.shutdownNotice}>
              <span>Why V2 exists</span>
              <strong>V1 went dark.</strong>
              <p>July 31, 2026 / the original site went offline</p>
              <em>I built it again.</em>
            </aside>
          </section>

          <section id="what-i-built" className={styles.toolkitSection}>
            <div className={styles.toolkitImageWrap}>
              <Image
                className={styles.toolkitImage}
                src="/special-message/technical-workbench.webp"
                alt="An overhead editorial still life of a camera, audio recorder, lighting controls, drone, notebook, keyboard, and custom water-cooled computer hardware."
                width={1536}
                height={1024}
                sizes="(max-width: 900px) 100vw, 58vw"
              />
              <span className={styles.imageTape} aria-hidden="true" />
              <p className={styles.imageIndex}>Field kit / 04</p>
            </div>

            <div className={styles.toolkitIntro}>
              <p className={styles.eyebrow}>Part 05 / What I can actually do</p>
              <h2>This is the kind of work I love doing.</h2>
              <p>
                I am a software engineer, but I have never stayed in one lane. I love the
                point where code, production, hardware, and a creative idea all meet. I am
                usually the person who wants to understand the entire setup and help wherever
                the gap is.
              </p>
            </div>

            <div className={styles.toolkitGrid}>
              {toolkit.map((item) => (
                <section className={styles.toolkitCard} key={item.number}>
                  <span>{item.number}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </section>
              ))}
            </div>
          </section>

          <section id="receipts" className={styles.receiptsSection}>
            <header className={styles.receiptsHeader}>
              <div>
                <p className={styles.eyebrow}>Part 05 / A few things I have made</p>
                <h2>I would rather show the work than oversell myself.</h2>
              </div>
              <p>
                These are real builds, footage, and project files from my life. They are here
                to give a simple picture of how I think and what I could help with.
              </p>
            </header>

            <details className={styles.evidenceDrawer} open>
              <summary>
                <span>Project archive</span>
                <strong>The work behind the story</strong>
                <em>Computer builds, project files, video, dubbing, and drone work</em>
              </summary>

              <div className={styles.evidenceDrawerBody}>

                <div className={styles.workbenchSpread}>
              <figure className={styles.workbenchMain}>
                <Image
                  src="/special-message/evidence/pc-build-open.webp"
                  alt="An open custom hardline water-cooled workstation during assembly, with clear blocks, a distribution plate, and purple lighting."
                  width={1600}
                  height={1298}
                  sizes="(max-width: 760px) 100vw, 66vw"
                />
                <figcaption>Workshop file 01 / loop under construction</figcaption>
              </figure>

              <figure className={styles.workbenchInset}>
                <span className={styles.imageTape} aria-hidden="true" />
                <Image
                  src="/special-message/evidence/pc-build-lit.webp"
                  alt="The completed custom water-cooled computer glowing through its glass side panel."
                  width={750}
                  height={1000}
                  sizes="(max-width: 760px) 62vw, 28vw"
                />
                <figcaption>Workshop file 02 / lights on</figcaption>
              </figure>

              <div className={styles.workbenchCopy}>
                <span>Built by hand</span>
                <h3>I like work where every small detail affects the whole system.</h3>
                <p>
                  Hardline tubing, custom cooling blocks, a distribution plate, cable
                  routing, leak testing, and the patience to rebuild a loop when one angle is
                  wrong. I approach software and production the same way: understand the
                  whole system, be patient, and care about the parts most people never see.
                </p>
              </div>

                </div>

                <div className={styles.filmRail} aria-label="Computer build film clips">
              <figure>
                <AutoLoopVideo
                  src="/special-message/evidence/pc-build-macro.mp4"
                  poster="/special-message/evidence/pc-build-open.webp"
                />
              </figure>
              <figure>
                <AutoLoopVideo
                  src="/special-message/evidence/pc-build-tour.mp4"
                  poster="/special-message/evidence/pc-build-lit.webp"
                />
              </figure>
              <figure>
                <AutoLoopVideo
                  src="/special-message/evidence/pc-build-red.mp4"
                  poster="/special-message/evidence/pc-build-red-poster.webp"
                />
              </figure>
                </div>

                <div className={styles.evidenceDesk}>
              <article className={styles.mercuryCard}>
                <div className={styles.mercuryLogoWrap}>
                  <Image
                    src="/special-message/evidence/army-mercury.webp"
                    alt="Army Reserve Mercury project mark"
                    width={1400}
                    height={788}
                    sizes="(max-width: 760px) 100vw, 46vw"
                  />
                  <span>Project case study / U.S. Army Reserve</span>
                </div>
                <div className={styles.mercuryCopy}>
                  <p className={styles.eyebrow}>Army Reserve Mercury / project</p>
                  <h3>A project for better notifications, forms, and faster paths to pay.</h3>
                  <dl className={styles.caseStudySteps}>
                    <div>
                      <dt>Problem</dt>
                      <dd>
                        Notifications, forms, and payment-related processes created avoidable
                        friction for reservists.
                      </dd>
                    </div>
                    <div>
                      <dt>Contribution</dt>
                      <dd>
                        I created a web and mobile notification system, pitched a redesigned
                        interface, and proved out form automation.
                      </dd>
                    </div>
                    <div>
                      <dt>Result</dt>
                      <dd>
                        Project sponsors adopted the new UI direction, while the automation
                        demonstrated a clearer path toward helping reservists get paid faster.
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>

              <article className={styles.degreeCard}>
                <div className={styles.degreeHeading}>
                  <Image
                    src="/special-message/evidence/ucf-mark.webp"
                    alt="University of Central Florida mark"
                    width={220}
                    height={220}
                  />
                  <div>
                    <span>Credential file / 2026</span>
                    <h3>B.S. in Computer Science</h3>
                    <p>University of Central Florida</p>
                  </div>
                </div>
                <figure>
                  <Image
                    src="/special-message/evidence/ucf-degree-redacted.webp"
                    alt="A redacted University of Central Florida Bachelor of Science degree in Computer Science."
                    width={1400}
                    height={1092}
                    sizes="(max-width: 760px) 100vw, 42vw"
                  />
                </figure>
              </article>
                </div>

                <article className={styles.dubbingSpread}>
              <div className={styles.dubbingCopy}>
                <p className={styles.eyebrow}>Audience expansion / language barrier</p>
                <h3>The same moment should be able to move past a language barrier.</h3>
                <p>
                  This Spanish-language proof of concept uses a CORE backyard episode to
                  explore how existing content could reach viewers beyond the English-speaking
                  audience—and make the archive more welcoming across countries and languages.
                </p>
                <span className={styles.dubbingStamp}>Escuchar en español</span>
              </div>
              <figure>
                <AutoLoopVideo
                  src="/special-message/evidence/core-backyard-es-dubbed.mp4"
                  poster="/special-message/evidence/core-backyard-dub-poster.webp"
                />
                <figcaption>
                  Proof of concept / Spanish-language version / original CORE backyard footage
                </figcaption>
              </figure>
                </article>

                <PanoramaViewer />
              </div>
            </details>
          </section>

          <p className={styles.continuedNote}>Continued / one last thing I want to say clearly</p>

          <section id="thank-you" className={`${styles.chapter} ${styles.chapterProof}`}>
            <div className={styles.chapterLabel}>
              <span>Part 06 / What I hope</span>
              <p>Thank you—and an open door</p>
            </div>

            <div className={styles.storyCopy}>
              <h2>I hope this starts a conversation.</h2>
              <p>
                I built this because I wanted to make something real out of how much CORE and
                its community have meant to me. If it helps someone see that, enjoy a part of
                it, or gives the community something worth returning to, I will be proud of it.
              </p>
              <div className={styles.openDoor}>
                <p>
                  If anyone on CORE&apos;s technical or creative side—including Bepsy, Woj, Drew,
                  or Sixty—sees something here and thinks I could help solve a real problem, I
                  would be excited to listen, learn, and show what I can do.
                </p>
              </div>
              <p className={styles.craftClosing}>
                Create. Own. Run. Everything. is what CORE stands for. I love that because it
                is the same instinct that has followed me since I was 11: take the idea
                seriously, learn every part of it, build it for real, and never sell it out or
                lose control of the craft.
              </p>
            </div>

            <div className={styles.proofNotes}>
              <div className={styles.clippedNote}>
                <small>CORE means</small>
                <span>Create.</span>
                <span>Own.</span>
                <span>Run.</span>
                <strong>Everything.</strong>
              </div>

              <aside className={styles.noInvoice}>
                <span>Just to be clear</span>
                <strong>This was a gift.</strong>
                <p>I am not asking CORE for payment or reimbursement for this website.</p>
              </aside>
            </div>
          </section>

          <section className={styles.platformStory} aria-labelledby="platform-story-title">
            <header className={styles.platformStoryHeader}>
              <div>
                <p className={styles.platformStoryKicker}>The platform / built to last</p>
                <h2 id="platform-story-title">A home that does not disappear with the feed.</h2>
              </div>
              <p>
                I built this not only so CORE has a real home when someone searches for it. I
                wanted one owned place where every member, community, live moment, and memory
                could keep living together.
              </p>
            </header>

            <div className={styles.platformScreens}>
              <figure className={styles.platformScreen}>
                <div className={styles.platformScreenVisual}>
                  <Image
                    src="/special-message/app-screens/home.png"
                    alt="The CORE home page, with a live stream featured in the hero area."
                    width={1265}
                    height={710}
                    sizes="(max-width: 720px) calc(100vw - 2rem), (max-width: 1100px) 50vw, 33vw"
                  />
                </div>
                <figcaption>
                  <span>01 / The front door</span>
                  <h3>One home for the whole house.</h3>
                  <p>
                    More than a profile link: a real front door for new fans, the community,
                    and anyone looking for CORE online.
                  </p>
                </figcaption>
              </figure>

              <figure className={styles.platformScreen}>
                <div className={styles.platformScreenVisual}>
                  <Image
                    src="/special-message/app-screens/guide.png"
                    alt="The CORE Guide showing live broadcasts, media formats, and timeline filters."
                    width={1265}
                    height={710}
                    sizes="(max-width: 720px) calc(100vw - 2rem), (max-width: 1100px) 50vw, 33vw"
                  />
                </div>
                <figcaption>
                  <span>02 / The living guide</span>
                  <h3>A record, not just a scroll.</h3>
                  <p>
                    Live streams, broadcasts, videos, Shorts, TikToks, and Instagram all have
                    a place after the moment passes.
                  </p>
                </figcaption>
              </figure>

              <figure className={styles.platformScreen}>
                <div className={styles.platformScreenVisual}>
                  <Image
                    src="/special-message/app-screens/now-playing-guide.png"
                    alt="The CORE in-player guide for the SLG Network, with current programming and live details."
                    width={1265}
                    height={710}
                    sizes="(max-width: 720px) calc(100vw - 2rem), 50vw"
                  />
                </div>
                <figcaption>
                  <span>03 / The guide stays with you</span>
                  <h3>Every network has a living schedule.</h3>
                  <p>
                    The guide can live beside the player, so viewers can move through each
                    network&apos;s live, video, short-form, and 24/7 programming with context.
                  </p>
                </figcaption>
              </figure>

              <figure className={styles.platformScreen}>
                <div className={styles.platformScreenVisual}>
                  <Image
                    src="/special-message/app-screens/flock-network.png"
                    alt="The Flock Network page with its dedicated 24/7 channel and live programming."
                    width={1265}
                    height={710}
                    sizes="(max-width: 720px) calc(100vw - 2rem), (max-width: 1100px) 50vw, 33vw"
                  />
                </div>
                <figcaption>
                  <span>04 / Every network has a world</span>
                  <h3>Different communities, one connected home.</h3>
                  <p>
                    Dedicated network pages and 24/7 programming let each member&apos;s world feel
                    intentional, while still connecting the entire house.
                  </p>
                </figcaption>
              </figure>
            </div>

            <div className={styles.platformPurpose}>
              <p>
                For CORE, this is an owned platform that can give future brands and sponsors a
                clearer place to understand the community, while bringing together
                admin-controlled, aggregate reach across connected social accounts.
              </p>
              <p>
                For viewers, it is entertainment 24/7, 365 days a year: one place for every
                platform, every member, and the memories that would otherwise be lost in a
                social feed.
              </p>
              <strong>Create. Own. Run. Everything. Own the platform.</strong>
            </div>
          </section>

          <section className={styles.closingSpread}>
            <div className={styles.closingImageWrap}>
              <Image
                className={styles.closingImage}
                src="/special-message/core-huddle.webp"
                alt="The CORE group huddled together and looking down toward the camera."
                fill
                sizes="(max-width: 900px) 100vw, 58vw"
              />
              <div className={styles.halftone} aria-hidden="true" />
            </div>

            <div className={styles.closingCopy}>
              <p className={styles.eyebrow}>The end / for everyone watching</p>
              <h2>For anyone who needed a little light on a hard day.</h2>
              <p>
                People rarely know what someone is carrying when they open a stream: grief, a
                toxic or abusive relationship, anxiety, depression, addiction, or a night when
                they are struggling to see a way forward. A lot of people in chat have lived
                through more than anyone can see.
              </p>
              <p>
                CORE did not have to know anyone&apos;s individual story to make a difference. The
                laughs, the streams, and the community gave people a place to breathe, feel
                less alone, and hold on through hard days. This page is a thank-you for the
                comfort that people have found here.
              </p>
              <div className={styles.closingRule} aria-hidden="true" />
              <strong>A thank-you to the creators, the community, and the reminder that no one is alone.</strong>
            </div>
          </section>

          <div className={styles.endBar}>
            <Link href="/">Explore what I built</Link>
            <span aria-hidden="true">◆</span>
            <a href="#special-message-top">Back to the top</a>
          </div>
        </div>
      </article>
    </>
  );
}
