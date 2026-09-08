import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  QrCode,
  ShieldCheck,
  Building2,
  GraduationCap,
  Users,
  Wallet,
  Wrench,
  ScanLine,
} from "lucide-react";
import PricingCards from "@/components/marketing/PricingCards";
import Brand from "@/components/ui/Brand";
const features = [
  {
    icon: QrCode,
    title: "A warm welcome. A smarter pass.",
    text: "Invite guests in a few taps. Give each visitor a unique QR pass and keep arrivals organised.",
  },
  {
    icon: Building2,
    title: "Every property, in perspective.",
    text: "Bring your properties, units and residents together in a workspace your team can navigate with ease.",
  },
  {
    icon: Wallet,
    title: "Less chasing. More clarity.",
    text: "See paid and outstanding rent, track maintenance requests and keep daily operations moving.",
  },
];
const people = [
  {
    icon: Users,
    title: "Residents",
    text: "Invite visitors and raise requests.",
  },
  {
    icon: ScanLine,
    title: "Security teams",
    text: "Find passes and manage arrivals.",
  },
  {
    icon: Building2,
    title: "Property managers",
    text: "Oversee properties, rent and reports.",
  },
  {
    icon: Wrench,
    title: "Platform admins",
    text: "Manage organisations and plans.",
  },
];
export default function LandingPage() {
  return (
    <div className="marketing">
      <header className="marketing-header">
        <Link href="/" aria-label="SangoPass home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#platform">The platform</a>
          <a href="#communities">Who it’s for</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <Link className="link-button dark" href="/login">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </header>
      <main id="main-content">
        <section className="hero marketing-width">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> CONNECTED PROPERTIES. BETTER LIVING.
            </div>
            <h1>
              Great communities
              <br />
              start with a<br />
              <span>better welcome.</span>
            </h1>
            <p>
              Meet SangoPass. Visitor access, residents and property operations,
              beautifully connected in one simple workspace.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="link-button dark">
                Start your free trial <ArrowUpRight size={18} />
              </Link>
              <a href="#how-it-works" className="text-link">
                See how it works <ArrowRight size={16} />
              </a>
            </div>
            <div className="hero-note">
              <ShieldCheck size={17} /> Built for South African residential
              communities
            </div>
          </div>
          <div className="hero-visual">
            <Image
              src="/brand/community-sa.webp"
              alt="Neighbours chatting in a Cape Town courtyard with Table Mountain beyond"
              fill
              sizes="(max-width: 800px) 100vw, 50vw"
              preload
              className="object-cover"
            />
            <div className="image-label">
              <span className="live-dot" /> A little more peace of mind.
            </div>
            <div className="arrival-card">
              <span className="arrival-icon">
                <Check size={20} />
              </span>
              <div>
                <strong>You’re on the list.</strong>
                <span>A seamless arrival starts here.</span>
              </div>
              <QrCode size={34} />
            </div>
            <span className="visual-caption">
              Many backgrounds. One community.
            </span>
          </div>
        </section>
        <div className="audience-strip marketing-width">
          <span>
            MADE FOR THE WAY
            <br />
            YOUR COMMUNITY LIVES
          </span>
          <div>
            <GraduationCap /> Student living
          </div>
          <div>
            <Building2 /> Apartment communities
          </div>
          <div>
            <ShieldCheck /> Residential estates
          </div>
        </div>
        <section id="platform" className="marketing-width marketing-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ONE WORKSPACE. EVERYDAY CLARITY.</p>
              <h2>
                Less admin.
                <br />
                More room for people.
              </h2>
            </div>
            <p>
              From the first invitation to the last check-out, make the everyday
              feel effortless for residents, security and management.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <div className="feature-top">
                  <span className="feature-icon">
                    <Icon size={23} />
                  </span>
                  <span>0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="communities" className="community-section marketing-width">
          <div className="community-image">
            <Image
              src="/brand/student-life-sa.webp"
              alt="A diverse group of South African university friends outside their student residence"
              fill
              sizes="(max-width: 800px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="community-copy">
            <p className="eyebrow">BUILT AROUND YOUR COMMUNITY</p>
            <h2>
              One platform.
              <br />
              Everyone at home.
            </h2>
            <p>
              A focused experience for every role, with a clear view of what
              matters to their day.
            </p>
            <ul>
              {people.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <Icon size={20} />
                  <div>
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                  <Check size={17} />
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section
          id="how-it-works"
          className="marketing-width marketing-section"
        >
          <p className="eyebrow">A SIMPLER WAY IN</p>
          <h2>From “come over” to “welcome in”.</h2>
          <div className="steps-grid">
            {[
              [
                "01",
                "Invite",
                "A resident adds their visitor and visit details.",
              ],
              [
                "02",
                "Share",
                "Open the unique digital pass, ready to share with a guest.",
              ],
              [
                "03",
                "Welcome",
                "Security verifies the invitation and records arrival.",
              ],
              [
                "04",
                "Stay informed",
                "Management sees the visitor record in one place.",
              ],
            ].map(([n, title, text]) => (
              <article key={n}>
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="pricing" className="marketing-width marketing-section">
          <p className="eyebrow">SPACE TO GROW</p>
          <h2>Simple plans. Stronger communities.</h2>
          <p className="mb-8 text-sm text-slate-500">
            Monthly pricing in rand, shaped around your property portfolio.
          </p>
          <PricingCards />
        </section>
        <section className="closing-cta marketing-width">
          <div>
            <p className="eyebrow">WELCOME TO A BETTER EVERYDAY</p>
            <h2>
              Your community.
              <br />
              Beautifully connected.
            </h2>
          </div>
          <div>
            <Link href="/register" className="link-button lime">
              Step inside SangoPass <ArrowUpRight size={18} />
            </Link>
            <p>
              Start a 14-day trial. No card required. Or{" "}
              <Link href="/demo">explore the demo</Link>.
            </p>
          </div>
        </section>
      </main>
      <footer className="marketing-footer marketing-width">
        <Link href="/">
          <Brand />
        </Link>
        <p>Thoughtfully built for the places we call home.</p>
        <span>© {new Date().getFullYear()} SangoPass</span>
      </footer>
    </div>
  );
}
