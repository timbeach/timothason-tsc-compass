# TSC Compass

**Live: https://compass.timbeach.com**

An unofficial, free companion for [The Science of Consciousness 2026](https://tsc2026.org/) in San Diego. Tell it what draws you to consciousness research, in a few words or by pasting your own abstract, then answer as many of the six short follow-ups as you like (up to three interests, where you lean, what you're here for, your fields and the ones you want to visit, how you like your evidence, logistics such as Zoom-only and the days you have left, and any must-see presenters), and it shows you:

- **Kindred spirits:** talks and posters close to your interests and your position.
- **Worthy opponents:** the same topic argued from a different position, which is where the good hallway conversations happen.
- **Serendipity:** one relevant pick from a field you might not visit.
- **My week:** the best session for you in each time slot, exportable to your calendar.
- **Questions to bring:** a friendly question and a skeptic's question for each presenter you're likely to hear, in schedule order, with a copy button.

Not affiliated with or endorsed by TSC. Every result links to the official abstract.

## How it works, in plain language

**1. Reading the program.** A small script downloads the public program from tsc2026.org: 292 talks, posters and workshops, with their abstracts and schedule. It reads each page once and keeps a local copy, so the official site isn't hammered.

**2. Turning abstracts into "meaning fingerprints."** Each abstract goes through a small open-source language model ([all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)), which turns text into a list of 384 numbers. Texts about similar ideas get similar numbers, even when they use different words. "Anesthetics and microtubules" lands near "quantum biology of tubulin," for example.

**3. Labeling each presentation once, ahead of time.** Claude (an AI model) read every abstract and wrote:

- a one-line summary in its own words. The site never republishes the abstracts themselves.
- the main discipline, the methods used, and a few key concepts.
- where the abstract leans on four spectrums: consciousness from physical processes versus consciousness as fundamental, classical versus quantum mechanisms, empirical versus theoretical, and brain-bound versus extended mind. Each label can also be "takes no position."
- two conversation starters: a friendly question, and the question a thoughtful skeptic would ask.

**4. Matching, entirely in your browser.** When you type, your browser downloads the same small model (about 25 MB, once) and fingerprints your text on your own device. Compass then:

- blends meaning similarity with plain keyword matching, so exact terms like "IIT" or "Orch OR" still count;
- estimates where your text sits on the four spectrums, or lets you set your stance with sliders;
- **kindred** = close in meaning and close in stance;
- **opponents** = close in meaning but far apart in stance;
- **serendipity** = highly relevant, but from different disciplines than your other matches (up to three, one per field);
- spreads the results out, so you don't get eight versions of the same talk.

**5. Planning your week.** The program runs several sessions in parallel each evening. For each time slot, Compass picks the session whose talks best match you. You can pin a different one, and export the plan as a calendar file.

**6. Field terms.** A short query is matched by meaning and by keyword, and neither knows that "psychokinesis" is what the program calls "mind-matter interaction", or that "QRNG" is usually spelled out. A small alias table (`core/aliases.ts`) appends the program's own words for terms like PK, QRNG, LLM, IIT, Orch OR and NDE, so the talks that use them turn up.

**7. Questions to bring.** Every abstract was labelled once with two questions, one a friendly listener would ask and one a thoughtful skeptic would. The section under your week gathers them for the presenters you're likely to hear: your matches, then the strongest two talks in each session the plan picked, in schedule order. Copy them as text, or print the page and only that section prints.

**8. The survey.** Everything after the first box is optional, and each answer maps to one thing the matcher can act on. Several interests are scored separately and a talk takes its best one, so two interests get covered instead of blurred into an average. "What are you here for" shifts the balance between kindred, opponents and serendipity. Your own fields get a small lift and the fields you're curious about steer the serendipity pick; nothing is excluded. Zoom-only keeps to the streamed sessions. "Vary my evenings" asks the plan not to send you to the same field four nights running when the runner-up is close. A must-see presenter pins their session. Answers are kept in your browser only.

**Privacy.** There's no server-side code at all: the site is static files. What you type never leaves your device, and nothing is fetched from third parties. The model, the runtime and the data are all served from compass.timbeach.com.

## Does it actually work?

As a sanity check we asked: given one concurrent talk, does Compass rank the other talks from the organizers' own session near the top? Mean reciprocal rank is 0.203 for Compass versus 0.153 for keyword search alone. The confidence intervals overlap, so it's suggestive rather than conclusive. A blind, human-judged evaluation with written attendee personas is the next step (`npm run label:personas`).

The stance spectrums are gated. The model's estimate of where *your* text sits is only switched on for a spectrum after a person has labeled a random sample and agreed with Claude's labels (Spearman 0.6 or higher), and after it predicts well on held-out data (0.5 or higher). Until then, you set your stance with sliders.

## Hacking on it

Requirements: Node 26.

```bash
npm install
npm test                 # unit tests (vitest)
npm run dev              # the web app at http://localhost:5173 (needs web/public/data, see below)
```

Build the data from scratch:

```bash
npm run scrape           # polite, cached download of tsc2026.org into data/raw/
npm run parse            # pages -> data/raw/records.json
npm run schedule         # listing pages -> data/build/slots.json
npm run embed            # meaning fingerprints for each candidate model
npm run axes -- minilm__truncate
npm run layout -- minilm__truncate
npm run export           # public bundle into web/public/data (refuses to ship abstract text)
npm run build && npm run e2e   # browser tests, including "no third-party requests"
```

The Claude labels are already committed in `data/build/enrichment/`. They're cached by a hash of each abstract, so only new or changed abstracts need relabeling (`npm run enrich`, needs `ANTHROPIC_API_KEY`).

Layout:

| Folder | What's there |
|---|---|
| `core/` | The matching engine. Pure TypeScript, shared by the evaluation and the browser. |
| `pipeline/` | Scraping, labeling, embedding, export |
| `eval/` | Evaluation harness and the blind labeling tools |
| `web/` | The site (Vite, vanilla TypeScript, the model runs in a Web Worker) |
| `docs/` | Design spec, build plan, review notes |

Ideas for the hackathon: attendee-to-attendee matching (opt in, "I'm here, working on X"), a live room map, better stance validation, and the persona evaluation.

## License

Code: MIT. Program content (titles, names, schedule) belongs to TSC and its presenters and is linked, not republished. AI-drafted summaries and questions are provided as conversation starters, not as statements of anyone's views.
