# Passenger product intent

This file is the working reference for how we simplify the app without losing its purpose.

## Core idea

Passenger should feel simple, calm, and obvious for people with:
- low literacy
- low digital confidence
- low attention
- little patience for complex flows

We are **not** redesigning for a "less capable" user in a disrespectful sense.
We are designing for people who need:
- fewer decisions
- clearer language
- stronger guidance
- visible next steps
- fewer chances to make a costly mistake

## Product intent we must preserve

The app is not just a list of deliveries.
It is a **guided, trust-based delivery workflow**.

The product must continue to support:
- verified people
- reviewed parcels
- clear step-by-step movement from listing to delivery
- safe payment before handover
- code-based proof at handover and at delivery
- disputes and accountability
- milestone tracking instead of fake live tracking

## Main design principle

**Do not simplify the rules. Simplify what the user sees at each moment.**

The system can remain strict.
The interface must become easier.

## The 3 questions every important screen should answer

1. What is happening?
2. What should I do now?
3. What happens after that?

If a screen does not answer these quickly, it is too complex.

## UX direction

The app should feel more like a:
- checklist
- guided assistant
- next-step tool

And less like a:
- marketplace dashboard
- logistics back office
- feature-heavy control panel

## Navigation direction

We have renamed the delivery activity area to **Milestones**.

Why:
- it reflects confirmed progress better than "Deliveries"
- it matches the app's real intent
- it avoids sounding like live tracking
- it emphasizes verified steps and progress

## Screen hierarchy direction

### 1. Home should become the command center
Home should focus on:
- **Do now**
- **Waiting**
- **Done**
- **Need help**

The most important thing should be the user's next safe action.

### 2. Milestones should become the record of progress
Milestones should show:
- what needs action now
- what is waiting on someone else
- what is finished
- what has a problem

Preferred groups:
- **Do now**
- **Waiting**
- **Finished**
- **Problems**

These are easier to understand than abstract workflow labels.

### 3. Delivery detail should become a guided step flow
Each delivery detail screen should feel like a step-by-step path.

Example structure:
- Step 1: Pay
- Step 2: Hand over parcel
- Step 3: Receiver gets parcel
- Step 4: Finished

Rules:
- current step is open and obvious
- past steps are collapsed or clearly completed
- future steps are visible but inactive
- only one main action should compete for attention

## Language rules

Use plain language.
Avoid system language when possible.

### Prefer
- We are checking your parcel
- Waiting for offers
- Traveller chosen
- Paid — ready for handover
- Traveller is carrying your parcel
- Delivered
- Problem reported
- Cancelled

### Avoid exposing internal terms directly
- pending_review
- matched
- funded
- in_transit
- disputed

### Writing style
- short sentences
- one idea at a time
- concrete verbs
- low jargon
- calm and helpful tone

## Action design rules

Every parcel card should show:
- one clear title
- one short explanation
- one main button

Example:
- **Paid — ready for handover**
- Meet the traveller and show your code only in person.
- **[Show handover code]**

## Safety-critical clarity

This app has risky actions.
The UI must reduce these mistakes:
- paying at the wrong time
- handing over before payment is confirmed
- sharing the wrong code with the wrong person
- confirming delivery before inspection

### Safety rules for UI
- always explain who a code is for
- always explain when to share it
- never make sender and receiver codes look interchangeable
- add short consequence-aware guidance near risky actions

Example:
- Show only to the traveller in person.
- Ask the receiver for this code only after inspection.
- Do not rely on screenshots or promises.

## Progressive disclosure

Show the simplest useful layer first.
Hide complexity until needed.

Default view should focus on:
- current status
- next action
- what happens next

Advanced detail can sit behind:
- See details
- Need help?
- View history

## Support direction

Low-confidence users need reassurance.
Important screens should always make help easy to find.

Preferred support affordances:
- Need help?
- I don't understand this
- Something went wrong

## What we should not become

We should not redesign this into:
- a courier map app
- a fake live tracking experience
- a generic social marketplace
- a complicated logistics admin tool

## Design test for future decisions

When we change a screen, ask:

1. Can the user tell what is happening in under 3 seconds?
2. Can the user see the one safest next action?
3. Is there unnecessary choice on this screen?
4. Are we using plain words instead of system words?
5. Is the difference between sender, traveller, and receiver obvious where needed?
6. Are we preventing code-sharing and payment mistakes?
7. Does this still preserve trust, verification, and milestone-based delivery flow?

## Current working decision

Current naming decision:
- **Deliveries** -> **Milestones**

This should remain aligned with the product intent:
- clear progress
- confirmed steps
- no fake tracking
- guided next action

## Next recommended design moves

1. Redesign Home around **Do now / Waiting / Done / Need help**
2. Redesign Milestones around **Do now / Waiting / Finished / Problems**
3. Redesign delivery detail into a step-by-step guided flow
4. Rewrite system-heavy copy into simpler English
5. Reduce competing actions on each parcel card
6. Keep trust and safety guidance visible at the moment of risk

---

This file should be updated as the product direction becomes sharper.
It is the reference for simplifying the app **without deviating from its intent**.
