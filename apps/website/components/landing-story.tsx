"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PassengerPhoneStage } from "./passenger-phone-stage";

const APP = "https://app.usepassenger.com/";
const benefits = [
  { image: "create-parcel", title: "A parcel with somewhere to be.", description: "Tell us what you're sending, where it's going and who will receive it." },
  { image: "create-trip", title: "A traveller already heading there.", description: "Find a compatible route and agree on the space, price and handover." },
  { image: "milestones-clear", title: "Know what happens along the way.", description: "Keep collection, check-ins and confirmed arrival together in Passenger." },
];
const cities = ["Jos", "Abuja", "Lagos"];

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
          {benefits.map(item => <article className="story-card" key={item.image}>
            <div className="story-card-image"><img src={`/illustrations/${item.image}.webp`} alt="" loading="lazy" /></div>
            <div className="story-card-copy"><h3>{item.title}</h3><p>{item.description}</p></div>
          </article>)}
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
          <div className="story-stack">{cities.map((name, index) => <button key={name} className={`story-city ${index === city ? "is-active" : (index - city + 3) % 3 === 1 ? "is-next" : "is-prev"}`} onClick={() => setCity(index)} aria-label={`View ${name}`} aria-pressed={index === city}><img src={`/illustrations/city-${name.toLowerCase()}.webp`} alt={`${name} city illustration`} loading="lazy" /><span>{name}</span></button>)}</div>
          <div className="story-gallery-controls"><button onClick={() => setCity((city + 2) % 3)} aria-label="Previous city"><ArrowLeft size={18} /></button><span aria-live="polite">{cities[city]}</span><button onClick={() => setCity((city + 1) % 3)} aria-label="Next city"><ArrowRight size={18} /></button></div>
        </div>
      </section>

      <section id="safety" className="story-section story-trust"><h2>Know who's<br />carrying it.</h2><div><p>Travellers complete identity checks before carrying parcels.</p><p>Keep your handover details and any supporting evidence in Passenger. Support can review them if you report a problem.</p></div></section>
    </div>
  );
}

export function LandingClosing() {
  return <section id="download" className="story-closing"><div className="story-closing-copy"><h2>Ready when<br />you are.</h2><p>Use Passenger in your browser. No download needed.</p><a href={APP}>Open Passenger <ArrowRight size={18} /></a></div></section>;
}
