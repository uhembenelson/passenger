# ROLE

Act as a world-class digital product agency combining:

- Senior Art Direction
- Product Design
- Interaction Design
- Motion Design
- Frontend Engineering
- UX Engineering

Your task is to design and implement the **hero experience and its scroll-driven continuation** for this product.

This should feel like the work of a premium digital agency, not a startup template.

---

# BEFORE YOU DESIGN OR CODE

First inspect the existing project thoroughly.

Understand:

- the current framework and frontend stack;
- existing component architecture;
- typography;
- font families and weights;
- spacing scale;
- colors;
- border radii;
- buttons;
- iconography;
- grid system;
- breakpoints;
- shadows;
- existing animations;
- CSS variables/design tokens;
- light/dark theme behavior;
- existing animation libraries;
- existing page/navigation structure.

## NON-NEGOTIABLE

**Use the project's existing design system.**

Do not introduce arbitrary new:

- brand colors;
- fonts;
- border radii;
- button styles;
- shadows;
- icon styles;
- visual language.

The finished hero should feel like it has always belonged to this product.

If a needed value is missing, derive it logically from the closest existing design token.

Do not redesign the brand.

---

# PRODUCT CONTEXT

We are building a peer-to-peer delivery platform.

The simple idea is:

Someone needs to send something to another city.

Someone else is already travelling to that city.

We bring them together.

The traveller earns for carrying the package.

The sender gets an easier way to send it.

The platform provides the trust and infrastructure around the transaction.

However:

**DO NOT explain all of that in the hero copy.**

The user should understand the concept primarily through:

1. one strong sentence;
2. the visual;
3. the scroll interaction.

---

# CORE BRAND IDEA

Everything should support this single promise:

# “Send it with someone already going your way.”

This is the hero headline.

Do not rewrite it.

Do not make it more corporate.

Do not add words such as:

- logistics;
- peer-to-peer;
- marketplace;
- shipping infrastructure;
- network;
- escrow;
- route optimisation;
- courier technology.

The language should remain human.

---

# BRAND FEELING

The customer should experience the product as:

- easy;
- human;
- trusted;
- calm;
- modern;
- intelligent;
- effortless;
- safe without feeling bureaucratic.

Avoid making the experience feel like:

- a traditional courier website;
- a transport company;
- an enterprise dashboard;
- fintech;
- Web3;
- an AI startup;
- a generic SaaS landing page.

The key emotional thought should be:

> “Oh. This makes sense.”

Not:

> “This looks technically impressive.”

---

# CREATIVE REFERENCE

Use the current LangChain homepage as inspiration specifically for its **interaction philosophy**:

- bold, restrained opening;
- minimal explanation above the fold;
- strong typography;
- visual storytelling;
- the page reveals meaning progressively as the user scrolls;
- transitions feel connected rather than like unrelated sections stacked vertically.

Do **not** copy:

- LangChain's layouts;
- illustrations;
- typography;
- visual assets;
- shapes;
- colors;
- graphics;
- exact animation.

We want the same level of restraint and choreography, not the same design.

---

# CENTRAL CREATIVE CONCEPT

The entire hero animation should visualize:

## TWO INTENTIONS BECOMING ONE JOURNEY.

There are initially two separate stories:

### Story A

A person has a package that needs to go somewhere.

### Story B

Another person is already travelling there.

As the visitor scrolls, these two independent paths discover each other.

The paths connect.

The package joins the traveller's existing journey.

The traveller continues.

The package arrives.

That visual sequence explains the entire business model without needing paragraphs.

---

# HERO STRUCTURE

Build the hero as a large scroll-driven experience.

Recommended architecture:

```text
Hero outer container
≈ 400–500vh desktop

    Sticky viewport
    height: 100vh

        Navigation
        Headline
        CTAs
        Animation canvas / scene
        Scroll indicator
```

The user scrolls through the outer container while the inner experience remains pinned/sticky.

The scene transforms progressively according to scroll position.

Do not treat these as separate slides.

It should feel like **one continuous composition evolving in place.**

---

# ABOVE THE FOLD — INITIAL STATE

At page load the visitor should see an extremely minimal screen.

## Copy

Primary headline:

# Send it with someone already going your way.

Do not add an explanatory paragraph underneath.

The sentence should have enough space to breathe.

Use the project's strongest display typography.

Aim for approximately:

- desktop: 64–100px depending on existing typography;
- tablet: 52–72px;
- mobile: 40–56px.

Do not blindly use these sizes if they conflict with the project's typography system.

Use responsive `clamp()` or existing responsive tokens.

Maximum headline width should create approximately 2–3 lines on desktop.

Do not force awkward line breaks.

---

# HERO ACTIONS

Include two clear actions:

### Primary
**Send something**

### Secondary
**I'm travelling**

Use the project's existing button system.

Do not create oversized “startup CTA” buttons.

The actions should feel understated and confident.

Inspect the application's existing routes and wire the buttons correctly.

Do not invent dead URLs.

---

# SUPPORTING COPY

Do not place a conventional subtitle under the hero.

No:

> “We connect verified travellers with package senders…”

No paragraph describing features.

No long trust statement.

The animation is the explanation.

If one tiny line is absolutely required for usability, it should never exceed approximately 5–7 words.

Prefer having none.

---

# SCROLL INDICATOR

Place a subtle scroll cue toward the bottom of the viewport.

It can be:

- a thin animated line;
- a small arrow;
- a tiny “Scroll” label;
- a restrained mouse/gesture cue.

It should disappear as soon as the user starts scrolling.

Do not make it decorative or distracting.

---

# VISUAL LANGUAGE

The animation should use abstract but understandable representations.

Think:

- route lines;
- location nodes;
- one simple package object;
- one human/traveller marker;
- destination marker;
- small identity/verification cue;
- subtle city labels;
- movement.

Do not create cartoon illustrations.

Do not use stock photos.

Do not create a literal Google Maps clone.

Do not use a giant 3D globe.

Do not use excessive glassmorphism.

Do not use generic glowing neon technology graphics.

Keep the geometry native to the project's design language.

---

# THE SCROLL STORY

The scroll must tell one understandable story.

Use approximately five phases.

---

# PHASE 0 — THE PROMISE

### Scroll progress:
0% → ~15%

Initial viewport.

Headline:

**Send it with someone already going your way.**

Buttons visible.

The scene underneath should feel alive but quiet.

Possible visual state:

Two faint independent paths exist in the background.

Neither is connected yet.

One represents the sender.

One represents the traveller.

They should not immediately reveal the full story.

Use very subtle idle motion:

- breathing opacity;
- slight line movement;
- gentle position drift;
- route pulse.

Nothing should continuously bounce.

---

# PHASE 1 — SOMETHING NEEDS TO GO

### Scroll progress:
~15% → ~32%

As the visitor begins scrolling:

The hero headline should remain visible initially, then gently reduce prominence.

Do not simply fade everything out.

Possible motion:

- headline moves slightly upward;
- scale reduces by only a few percent;
- opacity settles rather than disappearing;
- CTAs soften/fade.

Introduce the **sender path**.

A small package appears.

It should feel integrated into the scene rather than like a feature card popping onto the screen.

An origin node appears.

A destination node appears elsewhere.

Example small contextual labels may be:

**Jos**

and

**Abuja**

Do not make these major headline copy.

The package is clearly at the origin.

The route ahead is incomplete.

The visual communicates:

> Something needs to get there.

Avoid adding that exact sentence unless necessary.

---

# PHASE 2 — SOMEONE IS ALREADY GOING

### Scroll progress:
~32% → ~50%

Now reveal a second route independently.

A traveller marker appears.

The traveller is already moving.

This is important:

The animation must clearly show that **the traveller's journey existed before the package was introduced.**

We are not dispatching this person.

We are discovering someone who is already going there.

That distinction is fundamental to the business.

Show the traveller moving gradually along their path.

The destination of their route should align with the package destination.

The two paths should visually begin to reveal that they are related.

Optional tiny contextual text:

**Already going**

Keep it very small.

Do not create explanatory paragraphs.

---

# PHASE 3 — THE MATCH

### Scroll progress:
~50% → ~68%

This should be the key “aha” moment.

The package route and traveller route recognise that they share the same destination.

Visually:

- the two paths converge;
- matching portions align;
- nodes respond;
- route emphasis changes;
- unnecessary route fragments soften;
- package and traveller become visually associated.

Use a subtle but satisfying transition.

Possible interaction:

The sender route draws toward the traveller.

At the connection point:

- a small pulse occurs;
- the package shifts into the traveller's journey;
- route styling changes to indicate an active trip.

Do not use fireworks, confetti or huge glow effects.

This should feel intelligent and inevitable.

A visitor should understand:

> “They are both going the same way.”

without reading an explanation.

---

# PHASE 4 — SEND IT ALONG

### Scroll progress:
~68% → ~84%

The package is now travelling with the traveller.

Animate the traveller marker and package together along the same path.

This is the strongest visual representation of the product.

The user should visually understand:

**The journey was already happening.  
The package simply joined it.**

Do not introduce complicated feature explanations here.

Trust can be represented through tiny visual signals:

- verified badge;
- confirmation tick;
- subtle protected-payment icon;
- identity indicator.

These should function as **supporting signals**, not headline content.

Do not turn this section into:

“KYC → escrow → tracking → verification → OTP”.

Those features belong later on the page.

The hero's job is understanding.

---

# PHASE 5 — ARRIVAL

### Scroll progress:
~84% → 100%

The traveller reaches the destination.

The route resolves.

The package separates from the traveller and reaches a destination/receiver node.

Use a satisfying confirmation animation:

- route completes;
- node fills;
- package settles;
- small check appears.

Avoid huge success UI.

The final visual state should communicate:

**Delivered.**

A very small word can appear:

### Delivered.

Nothing else is necessary.

---

# END-OF-HERO TRANSITION

After delivery, do not abruptly cut into the next section.

The completed route should become the bridge into the next page section.

For example:

- completed route extends downward;
- viewport background subtly transitions;
- destination node becomes the anchor point of the next section;
- animation canvas shifts naturally out of frame.

The experience should make the user feel that the story continues down the page.

Avoid:

```text
Hero ends
——————
Completely unrelated white section starts
```

Transitions should feel authored.

---

# THE STORY THE USER SHOULD UNDERSTAND

Without reading technical documentation, by the end of this scroll interaction the visitor must understand:

1. I have something to send.
2. Someone is already travelling there.
3. This platform connects us.
4. My package travels with them.
5. It reaches the destination.

If that story is unclear, simplify the animation.

Never add more copy to compensate for a confusing animation.

Fix the animation.

---

# IMPORTANT PRODUCT TRUTH

The traveller should visually appear as an **independent traveller**, not:

- a delivery driver dispatched by us;
- a courier employee;
- a motorcycle rider waiting for jobs;
- a company fleet vehicle.

This matters enormously.

The customer should understand:

> The trip was happening anyway.

The product discovers that journey and lets the package travel along with it.

---

# MOTION DIRECTION

The animation should feel:

- smooth;
- deliberate;
- editorial;
- restrained;
- physical;
- premium.

Avoid “website animation for animation's sake.”

Use motion to explain relationships.

## Preferred properties

Animate mostly:

- `transform`;
- `opacity`;
- SVG stroke properties;
- clipping/masking;
- scale;
- controlled blur where appropriate.

Avoid repeatedly animating properties that trigger expensive layout/repaint.

---

# ROUTE ANIMATION

If routes are SVG:

Use techniques such as:

- `stroke-dasharray`;
- `stroke-dashoffset`;
- SVG masks;
- path progress;
- motion-path where appropriate.

Lines should draw naturally according to scroll progress.

Do not make route lines look like generic dotted airline maps unless that matches the existing design system.

---

# SCROLL BEHAVIOUR

Animation should be directly tied to scroll progress.

The user controls the story.

Scrolling slowly should reveal details slowly.

Scrolling quickly should move through the sequence naturally.

Scrolling upward should reverse the animation correctly.

No animation should become stuck or replay incorrectly.

---

# EASING

For scroll-scrubbed movement, avoid exaggerated easing because the scroll itself controls time.

For discrete state transitions use restrained easing such as:

- `power2.out`;
- `power3.out`;
- cubic-bezier equivalent;
- existing project easing tokens.

Never use:

- elastic;
- bounce;
- cartoon spring physics

unless the project's existing design language explicitly relies on them.

---

# TIMING / SCROLL MAP

Use this as the initial animation map:

```text
0.00 – 0.15
Hero promise / idle state

0.15 – 0.32
Sender + package + destination introduced

0.32 – 0.50
Traveller journey introduced

0.50 – 0.68
Routes recognise each other / match

0.68 – 0.84
Package joins traveller journey

0.84 – 0.95
Travel to destination

0.95 – 1.00
Delivery confirmation / transition
```

Tune these values after testing the experience.

Do not follow them mechanically if visual pacing feels wrong.

---

# CAMERA / COMPOSITION BEHAVIOUR

Treat the viewport almost like a cinematographer.

Do not simply animate objects independently.

The composition should evolve.

Example:

### Beginning

Headline dominates.

Scene is secondary.

### Sender appears

Composition subtly shifts to give the route more space.

### Traveller appears

Viewport balances two separate elements.

### Match

Attention moves toward the centre where the paths meet.

### Journey

The shared route becomes dominant.

### Delivery

Attention naturally lands at destination.

This movement can happen using:

- translation;
- scaling;
- masks;
- viewport positioning;
- whitespace.

No fake 3D camera is necessary.

---

# TYPOGRAPHY BEHAVIOUR

Do not constantly animate letters.

The headline is important enough to remain stable.

At most:

- gentle reveal on initial load;
- slight upward movement;
- subtle scale;
- controlled opacity.

Do not:

- scramble text;
- rotate words;
- typewriter animate;
- continuously replace words;
- animate every letter separately.

The message is more important than the effect.

---

# INITIAL PAGE LOAD

The initial load should feel calm.

Suggested sequence:

1. background appears;
2. navigation resolves;
3. headline reveals;
4. CTA actions reveal;
5. visual route scene becomes subtly active;
6. scroll indicator appears last.

Total entrance sequence:

approximately **700–1200ms**.

Do not make the visitor wait before interacting.

---

# NAVIGATION

Use the project's existing navigation if it exists.

Do not redesign the entire header simply to suit the hero.

The navigation should sit above the animated scene with correct contrast.

On scroll, if the existing project already has a sticky navigation pattern, preserve it.

---

# DESKTOP LAYOUT

Use whitespace aggressively.

The headline should dominate the first viewport.

Do not fill every available area with visual elements.

Suggested hierarchy:

```text
Navigation

Large whitespace

Headline
Headline
Headline

CTA    CTA

          visual storytelling area

Scroll indicator
```

The animation may partially occupy the lower half of the hero at first and become more dominant as scrolling progresses.

---

# MOBILE BEHAVIOUR

Do not simply shrink the desktop animation.

Design a mobile-specific composition.

Important:

- headline remains readable;
- no tiny labels;
- no overlapping route graphics;
- no horizontal overflow;
- buttons remain reachable;
- animation should remain understandable on a narrow screen.

Recommended mobile scroll container:

approximately **300–400vh**, depending on testing.

The sticky viewport can still be used, but reduce complexity.

The visual story remains:

```text
package
↓
traveller
↓
match
↓
travel
↓
delivered
```

Use fewer simultaneous objects.

---

# MOBILE CTA

If screen width is narrow:

Stack:

**Send something**

**I'm travelling**

or use the existing mobile button pattern.

Maintain at least 44px touch targets.

---

# REDUCED MOTION

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

For users requesting reduced motion:

Do not pin them inside a long animated scroll experience.

Instead show a simplified static or lightly transitioned sequence that communicates:

**Package → Traveller → Destination**

The page must remain completely understandable without animation.

---

# ACCESSIBILITY

Ensure:

- semantic HTML;
- logical heading hierarchy;
- keyboard-accessible actions;
- sufficient contrast;
- visible focus states;
- descriptive accessible labels;
- decorative SVGs hidden from screen readers where appropriate;
- animation does not interfere with navigation;
- no essential meaning exists exclusively in motion.

The headline must be a real `<h1>`, not text baked into SVG/canvas.

---

# PERFORMANCE

This experience must remain fast.

Target:

- smooth 60fps animation where device capability permits;
- no layout thrashing;
- no huge image sequences;
- no autoplay background video unless absolutely justified;
- lazy-load noncritical below-fold assets;
- defer animation initialization when appropriate;
- GPU-friendly transform animation;
- avoid unnecessary React re-renders during scroll.

Do not update React state every scroll frame.

Use animation-library/native animation values directly.

---

# ANIMATION LIBRARY

Inspect the project first.

If the project already uses:

- GSAP;
- Motion / Framer Motion;
- Lenis;
- React Spring;
- another established animation system;

reuse it.

Do not introduce multiple competing animation libraries.

For a complex pinned scroll sequence:

**GSAP + ScrollTrigger** is acceptable if already installed or clearly justified.

If Motion/Framer Motion is already the project's standard, prefer it where it can deliver the experience cleanly.

Do not add Lenis just because many agency sites use it.

Native scrolling is acceptable.

The website must still feel good without artificial smooth scrolling.

---

# COMPONENT ARCHITECTURE

Keep the implementation maintainable.

A reasonable structure might be:

```text
Hero
├── HeroCopy
├── HeroActions
├── ScrollIndicator
└── JourneyStory
    ├── SenderNode
    ├── Package
    ├── TravellerNode
    ├── DestinationNode
    ├── RoutePath
    └── StatusIndicator
```

Adapt this to the project's architecture.

Do not create one 1,000-line component.

Do not abstract tiny components unnecessarily either.

---

# STATE MODEL

Think in narrative states:

```ts
INTRO
SEND_REQUEST
TRAVELLER_FOUND
MATCHED
IN_TRANSIT
DELIVERED
```

The visual system should transition cleanly between these conceptual states.

Even if implementation uses a continuous progress value, thinking in states will keep the narrative coherent.

---

# VISUAL DETAILS

Potential subtle elements:

### Sender
Simple origin marker / small person indicator.

### Package
A minimal package glyph/object using project shapes.

### Traveller
Human/travel marker, not courier iconography.

### Route
Simple line connecting location nodes.

### Match
Subtle intersection/pulse.

### Trust
Small verified mark.

### Delivery
Destination completion state.

Keep decorative elements secondary.

---

# DO NOT DO THIS

Do not build:

- floating glass cards everywhere;
- giant feature cards;
- animated dashboard screenshots;
- spinning globes;
- random particles;
- a 3D truck;
- a courier motorcycle animation;
- a fake map interface;
- a generic “connecting people” network animation;
- gradient blobs purely for decoration;
- tech jargon inside the hero;
- excessive feature chips;
- multiple competing headline messages.

Do not explain every part of the product before the visitor has even scrolled.

---

# COPY RULES

The hero headline is fixed:

# Send it with someone already going your way.

Hero actions:

**Send something**

**I'm travelling**

During the animation, use as little supporting copy as possible.

Allowed microcopy examples:

**Already going**

**Same way**

**On the way**

**Delivered**

Do not use all of them unless needed.

The visual should carry most of the story.

---

# IMPORTANT COPY PRINCIPLE

Never say:

> “We match your package with a verified traveller heading toward the same destination and facilitate secure delivery…”

That is product documentation.

The homepage should feel like a brand.

---

# STORYBOARD

Before implementing the final animation, create the experience mentally or in code as these frames:

## Frame 01 — Promise

Large headline.

Quiet scene.

Two barely visible journeys.

---

## Frame 02 — Sender

Package appears at origin.

Destination becomes clear.

---

## Frame 03 — Traveller

Separate person is visibly already moving toward that destination.

---

## Frame 04 — Recognition

Both paths line up.

User understands they are going the same way.

---

## Frame 05 — Match

Package joins traveller.

Small satisfying visual confirmation.

---

## Frame 06 — Journey

Traveller + package move together.

Existing trip continues.

---

## Frame 07 — Arrival

Package reaches destination.

Minimal confirmation:

**Delivered.**

---

## Frame 08 — Continue

Scene naturally transitions into the next page section.

---

# UX TEST

After implementation, conduct this mental test:

Show someone the hero with the text removed after the opening headline.

Ask:

> “What do you think this company does?”

The animation should make them answer something close to:

> “It lets me send something with someone who's already going there.”

If they instead say:

> “It's a normal delivery company.”

the animation has failed.

If they say:

> “It's a travel app.”

the animation has failed.

If they cannot tell what is happening without reading paragraphs, the animation has failed.

---

# SUCCESS CRITERIA

The final hero succeeds if:

### Within 3 seconds

The visitor sees:

> **Send it with someone already going your way.**

### Within the first scroll

They understand:

> I have something to send.

### Shortly after

They see:

> Someone is already travelling there.

### At the match moment

They understand:

> The platform connects the two.

### By the end

They understand:

> The package travelled with that person and arrived.

All without a long explanation.

---

# RESPONSIVENESS QA

Test at minimum:

- 320px;
- 375px;
- 390px;
- 430px;
- 768px;
- 1024px;
- 1280px;
- 1440px;
- 1728px+.

Also test:

- short laptop screens;
- tall monitors;
- landscape mobile;
- browser zoom;
- Safari;
- Chrome;
- Firefox where relevant.

Ensure sticky calculations do not break with mobile browser chrome.

---

# SCROLL QA

Test:

- very slow scrolling;
- very fast scrolling;
- trackpad;
- mouse wheel;
- scrollbar dragging;
- touch scrolling;
- reversing scroll halfway;
- refreshing halfway down the page;
- navigating away and returning;
- browser resize during scene;
- back-button restoration.

The animation should always reconstruct the correct state from scroll position.

---

# PERFORMANCE QA

Use browser profiling.

Check for:

- forced synchronous layouts;
- unnecessary component re-renders;
- oversized SVG complexity;
- scroll-handler bottlenecks;
- memory leaks from timelines/listeners;
- animation contexts not being cleaned up after component unmount.

If using GSAP in React, correctly scope and clean up timelines/ScrollTriggers.

---

# DESIGN QUALITY BAR

The finished work should feel:

**minimal enough that every object has purpose**

but

**rich enough that scrolling feels memorable.**

The benchmark is not “does this animate?”

The benchmark is:

> **Does motion make the business easier to understand?**

---

# FINAL IMPLEMENTATION INSTRUCTION

Do not stop at a mockup.

Build the actual production-ready hero in the existing project.

Preserve the project's design system and architecture.

After implementation:

1. review the hero visually;
2. test every breakpoint;
3. test scroll forward and backward;
4. test reduced motion;
5. verify CTA links;
6. verify accessibility;
7. inspect performance;
8. remove unnecessary effects;
9. simplify anything that feels overdesigned.

If an animation is beautiful but makes the product harder to understand, remove it.

If additional copy is needed because the animation is unclear, improve the animation first.

The final experience should leave the user with one extremely simple idea:

# I can send something with someone who's already going my way.