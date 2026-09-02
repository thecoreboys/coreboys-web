import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AutoLoopVideo } from "./AutoLoopVideo";
import { PanoramaViewer } from "./PanoramaViewer";
import { StoryProgress } from "./StoryProgress";
import styles from "./special-message.module.css";

export const metadata: Metadata = {
  title: "A Personal Message",
  description:
    "A personal letter about code, creative production, the story behind Coreboys, and why I built this site.",
  alternates: { canonical: "/special-message" },
  openGraph: {
    title: "A Personal Message",
    description:
      "An open letter about this site, the people who inspired it, and why I made it.",
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
    body: "I build full-stack products, custom Java mods and plugins, and the systems behind streaming and digital experiences. I like taking a crazy idea and making it a reality.",
  },
  {
    number: "02",
    title: "Production & A/V",
    body: "I have worked with cameras, lenses, lighting, soundboards, live events, microphones, editing, and the full Adobe suite. I understand both the creative idea and the technical setup it needs.",
  },
  {
    number: "03",
    title: "Hardware & IT",
    body: "I build enterprise servers and custom gaming desktops, fly FAA-registered drones, troubleshoot technical problems, and keep learning until the whole system works, not just one part of it.",
  },
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
              <p className={styles.mastheadTitle}>A Personal Message</p>
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
            </figcaption>
          </figure>

          <section id="beginning" className={styles.chapter}>
            <div className={styles.chapterLabel}>
              <span>Part 01 / Age 11</span>
              <p>How I started</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>The beginning</p>
              <h2>I was always the kid behind the scenes.</h2>
              <p className={styles.dropCap}>
                I was 11 when I first got into programming. One of my earliest site ideas came
                from a Miami Heat game. My dad bought the tickets as a Christmas and birthday
                gift, then realized the seller had scammed him. Somehow, the night still turned
                into something I&apos;ll never forget. I met Udonis Haslem, shot free throws after
                the game with Norris Cole and the Heat&apos;s Big Three: LeBron James, Dwyane Wade,
                and Chris Bosh. I even got to hold championship rings. It showed me how one
                ticket can turn into a real memory, and that idea stuck with me.
              </p>
              <p>
                That stuck with me. One of my first big ideas was trying to buy web hosting so
                I could make a ticket site for my own knock-off basketball team, the Cranberry
                Crush. I got in trouble for the hosting part, but the instinct behind it never
                really left me.
              </p>
              <p>
                My introduction to Minecraft happened at a soccer field. Another kid&apos;s dad
                brought iPads for us to use, and I was fortunate enough to get one and play.
                I slowly but surely got Minecraft on PC, then learned how to moderate servers,
                build maps, develop in Java, and make mods and plugins. I kept following the
                next thing I was curious about, and every step pulled me further into making
                things other people could use and enjoy.
              </p>
            </div>

            <aside className={styles.marginFile}>
              <span className={styles.marginFileKicker}>Age 11 / first build</span>
              <strong>Cranberry Crush</strong>
              <p>
                A made-up basketball team and an early hosting idea. I tried to purchase hosting
                at age 11, got in trouble for it, and learned that an idea can feel real before
                it is ever built.
              </p>
              <span className={styles.redUnderline}>The first spark</span>
            </aside>
          </section>

          <section id="creator-work" className={`${styles.chapter} ${styles.creatorChapter}`}>
            <div className={styles.chapterLabel}>
              <span>Part 02 / 2018 to 2021</span>
              <p>The creator years</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>Minecraft opened a real door</p>
              <h2>I got to build for creators I had grown up watching.</h2>
              <p>
                Minecraft work opened the door to{" "}
                <a
                  className={styles.creatorInlineLink}
                  href="https://www.youtube.com/@Lubcubs"
                  target="_blank"
                  rel="noreferrer"
                >
                  Lubcubs Gaming
                </a>
                . Between 2018 and 2021, I also helped with projects for{" "}
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
                , and other creators I had watched for years.
              </p>
              <p>
                I was usually behind the scenes. Someone would bring in a strange or funny
                idea, and I would work out the Java, maps, mods, or plugins needed to make it
                happen. I set up simulators and tycoons, built challenge and hide-and-seek
                games, and figured out the little details that made each world feel alive.
                I was helping shape the kind of childhood I had grown up loving, even when I
                was nowhere near the camera.
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
                    <small>Creator work / 2018 to 2021</small>
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
                    <small>Creator work / 2018 to 2021</small>
                    <strong>GamingWithJen</strong>
                    <em>Official channel ↗</em>
                  </span>
                </a>
              </div>

            </div>

            <aside className={styles.marginFile}>
              <span className={styles.marginFileKicker}>A career in the making</span>
              <strong>Player → builder</strong>
              <p>I started out playing. Before long, I was the one building the maps, servers, and ideas.</p>
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
              <span>Part 03 / 2020 to college</span>
              <p>The hard years</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>This is the order it happened</p>
              <h2>Then I stopped feeling like myself for a while.</h2>
              <p>
                First, COVID hit while I was still in high school. After high school, I moved
                away to college. Then, while I was trying to adjust to college and adulthood,
                my parents divorced, and my health spiraled.
              </p>
              <p>
                It was a lot of change close together. I live with chronic anxiety and am
                neurodivergent, and those years made it hard to feel grounded. My confidence took
                a real hit, communication got harder, and there were long stretches where I felt
                stuck and unsure of what I was supposed to do next.
              </p>
              <p>
                If you&apos;ve ever felt like everyone else got a rule you somehow missed, or like
                you were in the room without really feeling part of it, I know that feeling. You
                might call it autism, neurodivergence, or anxiety. Or you might not
                have a name for it at all. Needing extra time, a little more context, or a quieter
                way in doesn&apos;t make you less capable. You still deserve a place in the room.
              </p>
              <p>
                I kept making things whenever I had the energy. I helped with sound, lighting,
                video, cameras, editing, computer systems, and software. Those projects gave me
                somewhere to be creative, keep learning, and turn an idea into something people
                could actually use.
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
              <span>Part 04 / College to now</span>
              <p>Why CORE mattered</p>
            </div>

            <div className={styles.storyCopy}>
              <p className={styles.previously}>The honest reason for this website</p>
              <h2>CORE gave me something to come back to on hard days.</h2>
              <p className={styles.dropCap}>
                There were days when I woke up already exhausted, went through the motions,
                and did not really feel like myself. During that time, I would put on a stream,
                watch a clip, or find some ridiculous joke and let it give me a break. It did not
                fix anything by itself, and I was never pretending it did. But those small breaks
                helped me laugh, reset, and get through the day.
              </p>
              <p>
                Maybe you know that feeling too: scrolling because the quiet is too loud, then
                finding something that gives you a few minutes of relief. It can look small from
                the outside, but small things still matter when a day is going badly. That is the
                kind of impact creative work can have, often without its creators ever knowing.
              </p>
              <p>
                That is why I made this. I wanted to turn that feeling into something practical:
                a place where the streams, clips, and memories are easier to find, without acting
                like any of it is bigger or more perfect than it really is.
              </p>
              <p>
                When V1 went offline on July 31, 2026, my free college server credits with
                DigitalOcean had expired. I had a choice: let the idea disappear with it, or
                build it again with more care. I chose to rebuild it. The site on this page is V2.
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
                I am a software engineer, but I do not stay in one lane. I like the point where
                code, production, hardware, and creative ideas meet. That mix is where I feel
                most creative.
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

            <PanoramaViewer />
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

            <div className={styles.evidenceDrawer}>
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
                <figcaption>Loop under construction</figcaption>
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
                <figcaption>Lights on</figcaption>
              </figure>

              <div className={styles.workbenchCopy}>
                <span>Built by hand</span>
                <h3>I like work where everything has to work together.</h3>
                <p>
                  Building a hardline loop makes you care about the stuff most people never
                  notice: tubing runs, custom blocks, cable routing, leak tests, even whether
                  one bend sits right. If something is off, I redo it. That is how I work in
                  software and production too. I learn the whole setup, take my time, and make
                  sure the details hold up.
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
                  <p className={styles.eyebrow}>A project I built / Army Reserve Mercury</p>
                  <h3>I built a better path for Army Reserve notifications and pay.</h3>
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
                        For this project, I created a web and mobile notification system, pitched a redesigned
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
                <p className={styles.eyebrow}>Spanish-language test</p>
                <h3>A version for people who speak Spanish.</h3>
                <p>
                  I used a CORE backyard episode to see how the same video could be easier to
                  follow for people who speak Spanish. It is a small example of how the archive
                  could reach more of the people already watching.
                </p>
                <span className={styles.dubbingStamp}>Escuchar en español</span>
              </div>
              <figure>
                <video
                  controls
                  playsInline
                  preload="metadata"
                  poster="/special-message/evidence/core-backyard-dub-poster.webp"
                >
                  <source src="/special-message/evidence/core-backyard-es-dubbed.mp4" type="video/mp4" />
                  Your browser does not support this video.
                </video>
                <figcaption>
                  Press play to hear the Spanish-language version of the original CORE backyard footage.
                </figcaption>
              </figure>
                </article>

              </div>
            </div>
          </section>

          <p className={styles.continuedNote}>Continued / one last thing I want to say clearly</p>

          <section id="thank-you" className={`${styles.chapter} ${styles.chapterProof}`}>
            <div className={styles.chapterLabel}>
              <span>Part 06 / What I hope</span>
              <p>Thank you and an open door</p>
            </div>

            <div className={styles.storyCopy}>
              <h2>I hope this starts a conversation.</h2>
              <p>
                I built this because CORE and its community have meant a lot to me. If it gives
                someone something fun to come back to or helps the community feel a little more
                connected, I will be proud of it.
              </p>
              <div className={styles.supportNote}>
                <span>A practical note</span>
                <p>
                  Keeping this site running is expensive. Azure hosting, storage buckets,
                  databases, Redis, social-fetch listeners waiting for new posts, API fees, and
                  the station audio setup all add up. If you would like to
                  help, please consider supporting the site for at least $3 a month, or whatever
                  amount feels right to you. I am hoping it can at least pay for itself. If it can
                  do more than that, it would mean the world to me.
                </p>
                <p>
                  I am also in a difficult place personally. I am at risk of losing my housing,
                  have no contact with my mother, and have been couch surfing. I do not want to
                  put pressure on the people helping me, which is why I am asking here instead.
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

              <aside className={styles.disclaimerCard}>
                <span>Disclaimer</span>
                <p>
                  This is an independent, community-created project and is not affiliated with,
                  endorsed by, or officially associated with CORE or its members.
                </p>
                <p>
                  The project is publicly shared as a portfolio piece to showcase my web
                  development, design, and software engineering work.
                </p>
                <p>
                  I&apos;m a big believer in the potential of CORE as a brand, platform, and
                  community, and I&apos;d love the opportunity to connect with Adapt, Woj, Bepsy,
                  or anyone on the technical, marketing, or digital team to discuss the project,
                  future ideas, or ways I could potentially contribute.
                </p>
                <p>
                  Feel free to reach out to me on X: {" "}
                  <a href="https://x.com/berryeyu" target="_blank" rel="noreferrer">
                    @berryeyu
                  </a>
                </p>
              </aside>
            </div>
          </section>

          {false ? <section className={styles.platformStory} aria-labelledby="platform-story-title">
            <header className={styles.platformStoryHeader}>
              <div>
                <p className={styles.platformStoryKicker}>The platform / built to last</p>
                <h2 id="platform-story-title">A home that does not disappear with the feed.</h2>
              </div>
              <p>
                I built this not only so CORE has a real home when someone searches for it. I
                wanted one place where every member, community, live moment, and memory could
                live together.
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
                  <span>01 / Home</span>
                  <h3>Start with what is live right now.</h3>
                  <p>
                    The home page leads with the live moment, then takes people to Originals,
                    clips, posts, and each CORE community.
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
                  <span>02 / Guide</span>
                  <h3>See what is live, then filter the rest.</h3>
                  <p>
                    The Guide puts live streams first and lets people narrow the timeline by
                    format, platform, or member.
                  </p>
                </figcaption>
              </figure>

              <figure className={styles.platformScreen}>
                <div className={styles.platformScreenVisual}>
                  <Image
                    src="/special-message/app-screens/now-playing-guide.png"
                    alt="The CORE theater view with Adapt's stream and the live chat panel open."
                    width={1265}
                    height={710}
                    sizes="(max-width: 720px) calc(100vw - 2rem), 50vw"
                  />
                </div>
                <figcaption>
                  <span>03 / Theater</span>
                  <h3>Keep the stream and chat together.</h3>
                  <p>
                    Theater keeps the player, details, Up Next, and chat in the same viewing
                    space instead of sending people through separate pages.
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
                  <span>04 / Flock network</span>
                  <h3>A dedicated place for each community.</h3>
                  <p>
                    Each network has its own 24/7 channel, programming modes, creator details,
                    and connected activity from across the web.
                  </p>
                </figcaption>
              </figure>
            </div>

            <div className={styles.platformPurpose}>
              <p>
                For CORE, it is one home base: a clear place for the community, future
                collaborators, and anyone trying to understand what the group is building.
              </p>
              <p>
                For viewers, it is one place to find every member, every platform, and the
                moments that would otherwise disappear in a feed.
              </p>
              <strong>Create. Own. Run. Everything. Own the platform.</strong>
            </div>
          </section> : null}

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
                You rarely know why someone opens a stream. Sometimes they want a laugh.
                Sometimes they just want a room that feels alive when their own day does not.
              </p>
              <p>
                CORE may never know what someone is carrying when they press play. But a laugh,
                a stream, or a chat that feels like company can change the shape of a night. It
                can give someone a breather, a reason to stay a little longer, or something to
                look forward to tomorrow. This page is my thank-you for every moment like that.
              </p>
              <div className={styles.closingRule} aria-hidden="true" />
              <strong>Thank you to the creators and the community for making people laugh when they need it.</strong>
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
