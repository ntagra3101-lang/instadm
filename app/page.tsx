import type { Metadata } from "next";
import "./landing.css";
import localFont from "next/font/local";
import { DemoNotice } from "@/components/demo-notice";

const geist = localFont({
  src: "../public/fonts/geist-latin.woff2",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Insta DM - Instagram comment-to-DM automation",
  description:
    "Turn Instagram keyword comments into automatic private replies.",
};

function ReplyPreview() {
  return (
    <figure
      className="or-preview"
      aria-label="Example campaign: a GUIDE comment triggers a private reply with a guide link"
    >
      <div className="or-preview-top">
        <span className="or-wordmark">
          Insta DM<span aria-hidden="true">↗</span>
        </span>
        <span className="or-mono">Campaign preview</span>
      </div>
      <div className="or-preview-body">
        <div className="or-preview-heading">
          <span className="or-avatar">S</span>
          <div>
            <strong>Sunday studio</strong>
            <span>@sunday.studio · Instagram</span>
          </div>
          <span className="or-active">Active</span>
        </div>
        <div className="or-post">
          <span className="or-mono">Campaign: New drop</span>
          <p>
            Comment GUIDE below
            <br />and I’ll send you the link.
          </p>
          <span>Keyword: GUIDE</span>
          <div className="or-post-lines" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="or-comment">
          <span className="or-avatar or-avatar-small">M</span>
          <div>
            <strong>maya.creates</strong>
            <p>GUIDE! need this 😍</p>
          </div>
        </div>
        <div className="or-match">
          <span aria-hidden="true">↓</span>
          <span>
            Keyword <code>GUIDE</code> matched
          </span>
          <span className="or-match-line" />
          <span>Private reply</span>
        </div>
        <div className="or-message">
          <span className="or-mono">Sunday studio → Maya</span>
          <p>Hey Maya! Here’s the link 👇</p>
          <span className="or-message-link">
            Shop the new drop <span aria-hidden="true">↗</span>
          </span>
        </div>
        <div className="or-delivered">
          <span aria-hidden="true">✓</span> Sent through the official Instagram
          API
        </div>
      </div>
      <figcaption>
        Example content. Your keywords, your message, your links.
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <div id="top" className={`or-landing ${geist.className}`}>
      <a className="or-skip" href="#main">
        Skip to content
      </a>
      <DemoNotice variant="banner" />
      <header className="or-header">
        <div className="or-container or-nav">
          <a className="or-wordmark" href="#top" aria-label="Insta DM home">
            Insta DM
          </a>
          <div className="or-nav-cta">
            <a className="or-button or-button-small" href="/login">
              Sign in <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="or-container or-hero">
          <div className="or-hero-copy">
            <h1>
              Turn Instagram comments
              <br />
              into private replies.
            </h1>
            <p className="or-lead">
              Someone comments a keyword on your post or reel, Insta DM sends
              them a DM automatically.
            </p>
            <div className="or-actions">
              <a className="or-button or-button-primary" href="/login">
                Sign in <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <ReplyPreview />
        </section>
      </main>
    </div>
  );
}
