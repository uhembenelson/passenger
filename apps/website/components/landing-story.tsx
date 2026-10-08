"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Slow, Lockers } from "@lucasmarkes/hairline/react";
import { PassengerPhoneStage } from "./passenger-phone-stage";

const APP = "https://app.usepassenger.com/";

const HAIRLINE_THEME = {
  "--hairline-plate": "#F0F3ED",
  "--hairline-hi": "#1F2937",
  "--hairline-edge": "#34D186",
  "--hairline-mid": "#A7B0BA",
  "--hairline-lo": "#D5DAD7",
  "--hairline-stroke": "0.95",
} as CSSProperties;

/** Large package envelope — hairline stroke style to match neighbouring figures. */
function PackageEnvelope({ className }: { className?: string }) {
  return (
    <div className={className} role="img" aria-label="A package envelope ready to send">
      <svg viewBox="0 0 400 320" className="h-full w-full" fill="none" aria-hidden>
        {/* Shadow plate / base */}
        <rect x="78" y="248" width="244" height="18" rx="9" fill="#F0F3ED" stroke="#D5DAD7" strokeWidth="1.5" />

        {/* Envelope body */}
        <path
          d="M72 118h256c10 0 18 8 18 18v112c0 10-8 18-18 18H72c-10 0-18-8-18-18V136c0-10 8-18 18-18Z"
          fill="#F0F3ED"
          stroke="#34D186"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />

        {/* Flap */}
        <path
          d="M54 136l146 78 146-78"
          stroke="#1F2937"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M54 136h292"
          stroke="#A7B0BA"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Inner crease */}
        <path
          d="M78 248V154l122 65 122-65v94"
          stroke="#A7B0BA"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* Package label */}
        <rect
          x="148"
          y="168"
          width="104"
          height="52"
          rx="8"
          fill="#F0F3ED"
          stroke="#1F2937"
          strokeWidth="1.75"
        />
        <line x1="162" y1="184" x2="238" y2="184" stroke="#A7B0BA" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="162" y1="196" x2="220" y2="196" stroke="#A7B0BA" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="162" y1="208" x2="206" y2="208" stroke="#34D186" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

const benefits: {
  title: string;
  description: string;
  visual: ReactNode;
}[] = [
  {
    title: "A parcel with somewhere to be.",
    description: "Tell us what you're sending, where it's going and who will receive it.",
    visual: <PackageEnvelope className="story-card-hairline story-card-envelope" />,
  },
  {
    title: "A traveller already heading there.",
    description: "Find a compatible route and agree on the space, price and handover.",
    visual: (
      <Slow
        play
        theme="light"
        intensity={0.45}
        label="A journey already underway"
        className="story-card-hairline"
        style={HAIRLINE_THEME}
      />
    ),
  },
  {
    title: "Know what happens along the way.",
    description: "Keep collection, check-ins and confirmed arrival together in Passenger.",
    visual: (
      <Lockers
        play
        theme="light"
        intensity={0.45}
        label="Milestones along the delivery"
        className="story-card-hairline"
        style={HAIRLINE_THEME}
      />
    ),
  },
];
/** Hairline-style cityscapes — places, not objects. */
function Cityscape({
  name,
  variant,
}: {
  name: string;
  variant: "jos" | "abuja" | "lagos";
}) {
  return (
    <div className="story-city-hairline" role="img" aria-label={`${name} city`}>
      <svg viewBox="0 0 280 340" className="h-full w-full" fill="none" aria-hidden>
        {/* Ground */}
        <line x1="24" y1="286" x2="256" y2="286" stroke="#D5DAD7" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24" y1="286" x2="256" y2="286" stroke="#34D186" strokeWidth="2" strokeDasharray="10 12" strokeLinecap="round" />

        {variant === "jos" ? (
          <>
            {/* Plateau hills */}
            <path d="M20 220c28-36 56-52 88-48 30 4 48 28 72 26 26-2 48-30 80-22" stroke="#A7B0BA" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M36 240c24-28 44-40 70-36 22 4 38 22 58 20 28-3 46-24 76-16" stroke="#D5DAD7" strokeWidth="1.4" strokeLinecap="round" />
            {/* Low town */}
            <rect x="58" y="214" width="36" height="72" rx="6" fill="#F0F3ED" stroke="#34D186" strokeWidth="1.8" />
            <rect x="102" y="196" width="44" height="90" rx="6" fill="#F0F3ED" stroke="#1F2937" strokeWidth="1.9" />
            <rect x="154" y="222" width="32" height="64" rx="6" fill="#F0F3ED" stroke="#34D186" strokeWidth="1.8" />
            <rect x="194" y="206" width="40" height="80" rx="6" fill="#F0F3ED" stroke="#A7B0BA" strokeWidth="1.7" />
            <line x1="116" y1="210" x2="116" y2="250" stroke="#A7B0BA" strokeWidth="1.2" />
            <line x1="132" y1="210" x2="132" y2="250" stroke="#A7B0BA" strokeWidth="1.2" />
          </>
        ) : null}

        {variant === "abuja" ? (
          <>
            {/* Planned avenues + capital landmark */}
            <rect x="48" y="186" width="34" height="100" rx="6" fill="#F0F3ED" stroke="#A7B0BA" strokeWidth="1.7" />
            <rect x="90" y="168" width="40" height="118" rx="6" fill="#F0F3ED" stroke="#34D186" strokeWidth="1.8" />
            {/* Central tall tower */}
            <rect x="138" y="118" width="36" height="168" rx="7" fill="#F0F3ED" stroke="#1F2937" strokeWidth="2.1" />
            <rect x="146" y="98" width="20" height="24" rx="4" fill="#F0F3ED" stroke="#1F2937" strokeWidth="1.6" />
            <line x1="156" y1="78" x2="156" y2="98" stroke="#34D186" strokeWidth="2" strokeLinecap="round" />
            <rect x="182" y="174" width="38" height="112" rx="6" fill="#F0F3ED" stroke="#34D186" strokeWidth="1.8" />
            <rect x="228" y="198" width="28" height="88" rx="6" fill="#F0F3ED" stroke="#A7B0BA" strokeWidth="1.7" />
            <line x1="150" y1="140" x2="162" y2="140" stroke="#A7B0BA" strokeWidth="1.2" />
            <line x1="150" y1="158" x2="162" y2="158" stroke="#A7B0BA" strokeWidth="1.2" />
            <line x1="150" y1="176" x2="162" y2="176" stroke="#A7B0BA" strokeWidth="1.2" />
          </>
        ) : null}

        {variant === "lagos" ? (
          <>
            {/* Dense skyline */}
            <rect x="36" y="198" width="28" height="88" rx="5" fill="#F0F3ED" stroke="#A7B0BA" strokeWidth="1.6" />
            <rect x="68" y="158" width="36" height="128" rx="6" fill="#F0F3ED" stroke="#34D186" strokeWidth="1.8" />
            <rect x="108" y="132" width="42" height="154" rx="6" fill="#F0F3ED" stroke="#1F2937" strokeWidth="2" />
            <rect x="154" y="168" width="34" height="118" rx="6" fill="#F0F3ED" stroke="#34D186" strokeWidth="1.8" />
            <rect x="192" y="148" width="38" height="138" rx="6" fill="#F0F3ED" stroke="#1F2937" strokeWidth="1.9" />
            <rect x="234" y="188" width="26" height="98" rx="5" fill="#F0F3ED" stroke="#A7B0BA" strokeWidth="1.6" />
            {/* Windows */}
            <line x1="122" y1="154" x2="122" y2="250" stroke="#A7B0BA" strokeWidth="1.15" />
            <line x1="136" y1="154" x2="136" y2="250" stroke="#A7B0BA" strokeWidth="1.15" />
            <line x1="206" y1="168" x2="206" y2="250" stroke="#A7B0BA" strokeWidth="1.15" />
            {/* Waterfront */}
            <path d="M28 300c40-10 70 8 110 0s70-12 116 2" stroke="#34D186" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M40 310c36-6 68 4 100-2s66-8 108 4" stroke="#A7B0BA" strokeWidth="1.3" strokeLinecap="round" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

const cities: { name: string; variant: "jos" | "abuja" | "lagos" }[] = [
  { name: "Jos", variant: "jos" },
  { name: "Abuja", variant: "abuja" },
  { name: "Lagos", variant: "lagos" },
];

export function LandingStory() {
  const [city, setCity] = useState(0);
  return (
    <div className="passenger-story">
      <section id="how-it-works" className="story-section">
        <div className="story-intro">
          <h2>From your hands.<br />To theirs.</h2>
          <p>Add your parcel details, choose a suitable trip and agree on the handover.</p>
        </div>
        <div className="story-benefits">
          {benefits.map(item => (
            <article className="story-card" key={item.title}>
              <div className="story-card-image">{item.visual}</div>
              <div className="story-card-copy"><h3>{item.title}</h3><p>{item.description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section id="app-preview" className="story-section story-product">
        <div className="story-product-heading"><h2>Your trips at a glance.</h2></div>
        <div id="senders-travellers" className="story-product-stage">
          <div className="story-product-side"><h3>Something to send?</h3><p>Enter the destination, contents and size of your parcel.</p><a href={APP}>Send a parcel <ArrowRight size={17} /></a></div>
          <PassengerPhoneStage />
          <div className="story-product-side"><h3>Going somewhere?</h3><p>Publish your route, departure date and available luggage space.</p><a href={APP}>Publish a trip <ArrowRight size={17} /></a></div>
        </div>
      </section>

      <section id="about" className="story-section story-about">
        <div className="story-about-copy"><h2>Which city<br />is next?</h2><p>Browse published trips by destination and departure date.</p><a href={APP} className="story-text-link">Find a route <ArrowRight size={18} /></a></div>
        <div className="story-gallery">
          <div className="story-stack">
            {cities.map((item, index) => {
              const active = index === city;
              return (
                <button
                  key={item.name}
                  type="button"
                  className={`story-city ${active ? "is-active" : (index - city + 3) % 3 === 1 ? "is-next" : "is-prev"}`}
                  onClick={() => setCity(index)}
                  aria-label={`View ${item.name}`}
                  aria-pressed={active}
                >
                  <div className="story-city-figure">
                    <Cityscape name={item.name} variant={item.variant} />
                  </div>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
          <div className="story-gallery-controls">
            <button type="button" onClick={() => setCity((city + 2) % 3)} aria-label="Previous city"><ArrowLeft size={18} /></button>
            <span aria-live="polite">{cities[city].name}</span>
            <button type="button" onClick={() => setCity((city + 1) % 3)} aria-label="Next city"><ArrowRight size={18} /></button>
          </div>
        </div>
      </section>

      <section id="safety" className="story-section story-trust"><h2>Know who's<br />carrying it.</h2><div><p>Travellers complete identity checks before carrying parcels.</p><p>Keep your handover details and any supporting evidence in Passenger. Support can review them if you report a problem.</p></div></section>
    </div>
  );
}

export function LandingClosing() {
  return <section id="download" className="story-closing"><div className="story-closing-copy"><h2>Ready when<br />you are.</h2><p>Use Passenger in your browser. No download needed.</p><a href={APP}>Open Passenger <ArrowRight size={18} /></a></div></section>;
}
