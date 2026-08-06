# Writing Guidelines (The Sanitizer)

This file is the project's **writing style source of truth** for resume bullets,
summaries, cover letters, and other AI-drafted prose in Resume Editor.

Machine-readable, resume-adapted rules live in `src/utils/aiGuides.ts`
(`RESUME_WRITING_RULES`) and are prepended to every BYOK writing feature via
`buildFeaturePrompt(...)`.

When revising AI rewrite/summary/cover-letter behavior, update both this guide
and the compact rules in `aiGuides.ts`.

## Resume bullets (app house rules)

These rules are also embedded in `RESUME_WRITING_RULES` and feature steps:

1. **XYZ method:** each bullet is action verb + task/project + result/impact.
2. **Action verb bank:** prefer openers from `ACTION_VERBS` in `aiAssist.ts`
   (Leadership, Engineering, Analysis, Creation, Collaboration, Impact) — the
   same bank as the AI drawer Verbs tab. Close synonyms from the same category
   are fine; vary openers across bullets in a role.
3. **Quantify truthfully:** add %, $, users, time, or volume only when present
   in the source bullet, resume context, or user clarifications. Never invent
   metrics.
4. **Skill through work:** demonstrate a skill, tool, or domain by describing
   what was done — not generic soft-skill fluff.

Truth-only remains absolute for every rewrite surface.

---
# The Sanitizer 2.0  
## A Research-Backed System for Detecting Formulaic Prose and Writing with a Real Human Voice

This guide expands the original Sanitizer into a complete writing system. It does not treat a detector score as proof that a person used AI. It treats repetitive, generic, over-balanced prose as a craft problem that can be studied, measured, and revised.

The goal is not to disguise machine output. The goal is to produce writing that contains the things generic machine prose usually lacks: a clear point of view, specific evidence, meaningful variation, genre awareness, and choices that belong to an identifiable writer.

A useful distinction runs through the whole guide:

- **Style analysis** asks whether a passage contains patterns common in formulaic or model-generated prose.
- **Authorship verification** asks who actually produced it and how.
- **Writing improvement** makes the prose clearer, more specific, and more recognizably shaped by a person.

Style analysis can support an investigation. It cannot settle one by itself.

---

# PART I: Research Plan

## 1. Questions the Research Must Answer

The research should answer five separate questions rather than collapsing them into one vague question about whether prose â€œsounds AI.â€

1. Which language patterns appear unusually often in generic model output?
2. Which of those patterns also appear naturally in certain human genres?
3. How do strong human writers vary syntax, rhythm, stance, detail, and paragraph structure?
4. Which style qualities transfer across genres, and which ones must remain genre-specific?
5. How can a writer revise formulaic prose without inserting fake mistakes, random slang, or copied mannerisms?

The fifth question matters most. Artificial roughness is still artificial. A sentence does not become human because someone adds a typo, a fragment, or an uncommon synonym. Human voice comes from consistent judgment.

## 2. Source Hierarchy

Use sources in the following order.

### Tier 1: Public-Domain Human Prose

Public-domain books provide large bodies of writing created before generative AI and often before modern corporate or academic templates flattened prose into a common register.

Recommended source library:

- Project Gutenberg
- Standard Ebooks
- Internet Archive scans when the text is clearly dated and attributed
- HathiTrust public-domain collections
- University-hosted public-domain editions

Use complete works rather than quote collections. A quote collection exaggerates polished one-liners and removes the ordinary connective prose needed to study rhythm.

Suggested texts by purpose:

| Purpose | Texts and writers to sample | What to study |
|---|---|---|
| Social narrative | Jane Austen, especially *Pride and Prejudice* and *Emma* | Indirect characterization, social inference, dialogue, controlled irony |
| Adventure and scene movement | Robert Louis Stevenson and Jack London | Physical sequencing, momentum, concrete setting |
| Mystery and explanation through evidence | Arthur Conan Doyle | Clue order, controlled revelation, observation before conclusion |
| Conversational narrative | Mark Twain | Spoken rhythm, comic timing, plain comparison, purposeful digression |
| Interior and reflective prose | Virginia Woolf essays and public-domain fiction | Thought movement, sentence expansion, shifts in attention |
| Scientific explanation | Charles Darwin | Causal patience, evidence, qualification, mechanism |
| Practical explanation | Benjamin Franklin | Direct advice, examples, practical reasoning |
| Investigative nonfiction | Ida Tarbell and Lincoln Steffens | Fact patterns, attribution, accumulation of evidence |
| Speeches and arguments | Frederick Douglass, Abraham Lincoln, Sojourner Truth | Claim order, moral force, repetition with purpose |
| Style mechanics | William Strunkâ€™s original *The Elements of Style* | Compression, sentence control, needless-word removal |

Do not build a reference corpus from one author. The system would learn that authorâ€™s quirks instead of broader human variation.

### Tier 2: Archival Everyday Writing

Published books are edited. Letters, diaries, notebooks, oral histories, and speeches show how people connect thoughts when they are not polishing every sentence for publication.

Recommended archives:

- Library of Congress manuscript and correspondence collections
- Chronicling America newspaper archive
- Presidential papers and historical letter collections
- University oral-history projects
- Smithsonian archival collections
- National Archives documents
- Pre-2020 personal blogs with stable authorship and dates

These sources are especially useful for conversational prose, professional correspondence, personal reflection, and speech rhythm.

### Tier 3: Pre-2020 Professional Writing

Use material published before widespread generative writing tools changed online prose habits.

Recommended categories:

- Newspaper reporting from established outlets
- Long-form magazine essays
- Annual reports and shareholder letters
- Technical documentation
- Government guidance
- University writing centers
- Product manuals
- Pre-2020 specialist blogs written by named experts
- Paul Grahamâ€™s essays published before 2020 for plain, idea-led explanatory prose

Preserve genre boundaries. A technical manual should not set the rhythm baseline for a memoir, and a personal blog should not determine the hedge rate of a research paper.

### Tier 4: Style and Plain-Language Guidance

Use established writing guides to interpret patterns found in the corpus.

Core references:

- William Strunk, *The Elements of Style*, original edition
- George Orwell, â€œPolitics and the English Languageâ€
- William Zinsser, *On Writing Well*
- Federal plain-language guidance
- Microsoft Writing Style Guide
- Purdue Online Writing Lab
- Associated Press conventions for news writing
- Classical rhetoric for argument structure

These guides should inform revision principles. They should not become rigid laws. Passive voice, long sentences, technical terms, repetition, and parallel structure all have legitimate uses.

### Tier 5: Stylometry and AI-Detection Research

Use two research traditions together.

**Pre-AI stylometry** identifies stable features used in authorship analysis:

- Function-word patterns
- Character and word n-grams
- Sentence length and variation
- Punctuation habits
- Vocabulary richness
- Part-of-speech distribution
- Paragraph shape
- Preferred syntactic constructions

**Modern AI-detection research** examines model-specific patterns and detector limitations:

- Perplexity and token predictability
- Sentence-level variance
- Classifier performance across topics and models
- False positives
- Bias against non-native English writing
- Performance loss after editing or domain shifts
- Limits of assigning authorship from text alone

Modern detector research belongs in the guide because the object being studied is new. The human reference corpus should remain largely pre-AI.

## 3. Corpus Construction Protocol

A useful corpus needs deliberate controls.

### 3.1 Match the Genre

Create a separate reference set for each writing type:

- Narrative fiction
- Memoir and personal essay
- Explanatory nonfiction
- Analytical and white-paper prose
- Academic writing
- Technical instructions
- Business communication
- News reporting
- Persuasive writing
- Marketing copy
- Conversational writing
- Speeches and presentations

Never compare a lab report directly with a short story and call the differences evidence of AI.

### 3.2 Balance Authors

For each genre:

- Include at least ten writers when possible.
- Prevent one writer from supplying more than 20 percent of the words.
- Include different periods, backgrounds, and sentence traditions.
- Separate edited publication from informal correspondence.
- Record whether the writer was a native or additional-language English user when that information is known and relevant.

### 3.3 Control the Text

Before analysis:

- Remove tables of contents, publisher notices, OCR debris, and duplicated headers.
- Keep punctuation and paragraph breaks.
- Preserve dialogue tags and quotations.
- Separate footnotes from body text.
- Record title, author, year, genre, source, and word count.
- Divide long works into coherent sections rather than arbitrary equal chunks.
- Use passages long enough to reveal style. A single paragraph rarely supports a reliable conclusion.

### 3.4 Build Two Baselines

Use both:

1. **Genre baseline:** What is normal for this kind of writing?
2. **Writer baseline:** What is normal for this person?

A writerâ€™s previous work is often more useful than a generic â€œhumanâ€ corpus. Sudden changes in phrase choice, paragraph shape, or certainty may justify closer review, though they still do not prove AI use.

## 4. Research Outputs

The research should produce five practical tools:

1. A library of AI-associated patterns with context and exceptions
2. A genre-specific scoring system
3. A human-review worksheet
4. Style recipes for drafting and revision
5. A source map showing which human texts informed each recipe

---

# PART II: What Formulaic AI-Like Prose Looks Like

A single word does not identify AI writing. Look for clusters across several levels.

## 1. Lexical Patterns

### 1.1 Inflated Verbs

Common examples:

delve, foster, unlock, unleash, harness, navigate, underscore, bolster, embark, streamline, elevate, showcase, illuminate, unpack, unravel, empower, facilitate, optimize, curate, spearhead, champion

These words are not forbidden. The problem appears when they replace a more exact action.

- â€œThe program fosters collaborationâ€ gives no mechanism.
- â€œThe program pairs junior engineers with a reviewer for two weekly design sessionsâ€ gives one.

### 1.2 Inflated Adjectives

Common examples:

robust, seamless, holistic, dynamic, vibrant, cutting-edge, groundbreaking, transformative, innovative, multifaceted, nuanced, intricate, meticulous, comprehensive, bespoke, unparalleled, unwavering, invaluable, pivotal, paramount

Ask what the adjective proves. â€œRobustâ€ may refer to fault tolerance, statistical stability, or physical strength. Name the property.

### 1.3 Abstract Container Nouns

Common examples:

landscape, realm, tapestry, journey, ecosystem, framework, narrative, paradigm, space, arena, dimension, aspect

These nouns let a sentence sound organized without naming the object under discussion.

- Weak: â€œThe evolving semiconductor landscape creates new challenges.â€
- Better: â€œAutomakers now need more audio processing without adding another external DSP or memory device.â€

### 1.4 Transition Density

Formulaic prose often relies on visible connective tissue:

moreover, furthermore, additionally, consequently, notably, importantly, ultimately, essentially

Strong prose usually lets logic create the transition. A transition word should clarify a real relationship, not announce that another sentence has arrived.

### 1.5 Lexical Neutrality

Generic model prose often avoids ordinary, opinion-bearing words. It chooses â€œpresents challengesâ€ instead of â€œcreates three expensive problems,â€ or â€œmay not be idealâ€ instead of â€œmisses the requirement.â€

A human voice makes calibrated judgments. It does not hide every judgment inside polite abstraction.

## 2. Phrase-Level Patterns

Flag repeated use of phrases such as:

- â€œIn todayâ€™s fast-paced worldâ€
- â€œIn an ever-evolving landscapeâ€
- â€œIt is important to noteâ€
- â€œIt is worth mentioningâ€
- â€œThis is not just about X; it is about Yâ€
- â€œWhether you are a beginner or an expertâ€
- â€œThe possibilities are endlessâ€
- â€œLet us dive inâ€
- â€œWithout further adoâ€
- â€œA testament toâ€
- â€œStands as a reminderâ€
- â€œUnlock the potentialâ€
- â€œPlays a crucial roleâ€
- â€œSheds light onâ€
- â€œPaves the wayâ€
- â€œAt its coreâ€
- â€œIn conclusionâ€

The revision rule is simple: replace the phrase with the fact, action, mechanism, or judgment it was delaying.

## 3. Sentence-Level Patterns

### 3.1 Balanced Sentence Repetition

Model prose often repeats the same internal design:

- claim + explanation
- claim + explanation
- claim + explanation

The sentence lengths may differ slightly, but each sentence performs the same job in the same order.

Human variation comes from sentence function:

- observation
- fact
- inference
- example
- qualification
- reaction
- question
- command
- transition
- conclusion

Varying word count without varying sentence function produces cosmetic burstiness.

### 3.2 Compulsive Completeness

Each sentence arrives polished, self-contained, and evenly qualified. Real writers sometimes let one sentence depend on the last. They also leave an implication unstated when the reader can supply it.

### 3.3 False Agency

Inanimate subjects repeatedly perform vague human actions:

- â€œThe report exploresâ€
- â€œThe data revealsâ€
- â€œThe strategy seeksâ€
- â€œThe platform empowersâ€
- â€œThe solution enablesâ€

Some of these are normal. The problem comes when the sentence hides the actor or mechanism.

- Weak: â€œThe architecture enables lower cost.â€
- Better: â€œTI integrates the DSP, memory, networking, and audio interfaces on one device, so the design needs fewer companion chips.â€

### 3.4 Reversal Templates

Examples:

- â€œIt is not X. It is Y.â€
- â€œThis is more than X; it is Y.â€
- â€œThe question is not whether X, but how Y.â€
- â€œRather than simply X, the system Y.â€

These structures can work once. Repeated use makes the argument sound generated around rhetorical templates instead of discovered through reasoning.

### 3.5 Excessive Symmetry

Watch for:

- Three adjectives before a noun
- Three examples in every paragraph
- Three clauses joined in parallel
- A short punch line after every long sentence
- Identical paragraph openings
- Identical concluding sentence shapes

Human prose uses symmetry selectively. Formulaic prose uses it automatically.

## 4. Paragraph-Level Patterns

### 4.1 Topic-Sentence Lockstep

Every paragraph begins with a broad claim, supplies two or three supporting sentences, and ends with a compressed restatement.

This school-essay structure is not wrong. Repeating it for a whole document makes the thinking feel preformatted.

### 4.2 Unearned Mini-Conclusions

AI-like paragraphs often end with a sentence designed to sound quotable:

- â€œThat is what true innovation looks like.â€
- â€œThe result is a smarter path forward.â€
- â€œThis is where the future begins.â€

A paragraph should end when its thought is complete, not when it reaches a slogan.

### 4.3 Uniform Paragraph Size

Six paragraphs of almost equal length often feel manufactured, especially in conversational or narrative writing. Paragraph length should follow thought, scene, evidence, or action.

### 4.4 List Reflex

Models turn complex material into lists because lists are easy to organize and hard to misunderstand. Lists are appropriate for procedures, comparisons, and reference material. They are not automatically the best form for explanation, argument, or conversation.

## 5. Discourse-Level Patterns

### 5.1 Announce, Perform, Recap

The document explains what it will cover, covers it, and repeats what it covered. This scaffolding often consumes a fifth of the text without adding substance.

Use previews only when the document is long or technically complex. Use summaries only when the reader benefits from consolidation.

### 5.2 False Balance

â€œBoth sides have valid pointsâ€ can hide a lack of judgment. A fair analysis should represent competing evidence, but fairness does not require equal weight when the evidence is unequal.

### 5.3 Universalized Audience

Phrases such as â€œwe all,â€ â€œeveryone,â€ â€œpeople today,â€ and â€œwhether you are a beginner or an expertâ€ erase the actual reader.

Name the audience:

- a first-year engineering student
- a purchasing manager
- an OEM audio architect
- a voter unfamiliar with the bill
- a customer comparing two products

### 5.4 Generic Stakes

AI prose often claims that everything is crucial, transformative, or increasingly important. Human writers rank stakes.

State what happens if the reader ignores the issue. Cost rises by how much? Which deadline slips? Who takes the risk? What decision changes?

## 6. Evidence and Specificity Patterns

### 6.1 Detail Without Consequence

A model can add names, numbers, and dates while still sounding generic if the details do not affect the reasoning.

Useful detail changes the sentence:

- a number establishes scale
- a date establishes sequence
- a quotation reveals stance
- an object grounds a scene
- a technical specification explains a constraint

### 6.2 Citation Decoration

A passage may contain citations but fail to connect them to specific claims. Check whether the source actually supports the sentence and whether the wording distinguishes evidence from inference.

### 6.3 Missing Friction

Human accounts include constraints, mistakes, tradeoffs, awkward details, and exceptions. Generic prose often describes clean progress.

A believable project description may include a failed prototype, an interface limitation, a disputed assumption, or a choice made under time pressure. Do not invent friction. Preserve it when it is true.

## 7. Epistemic Patterns

Epistemic style shows how a writer handles certainty.

### 7.1 Hedge Stacking

Examples:

- â€œIt could perhaps be argued thatâ€
- â€œThe results may potentially suggestâ€
- â€œIt seems possible that this mightâ€

Use one level of caution.

- â€œThe results suggestâ€
- â€œThis explanation remains uncertain because the sample is small.â€

### 7.2 Unqualified Confidence

The opposite problem also appears. A polished answer may state uncertain facts as settled. Human expertise often sounds more specific about uncertainty, not more timid.

- Weak: â€œThis proves the architecture is cheaper.â€
- Better: â€œThe integrated design should reduce component count, though the final system cost depends on memory size, networking requirements, and software licensing.â€

### 7.3 Empty Caveats

â€œMore research is neededâ€ says little. Name the missing test, population, variable, or time horizon.

## 8. Voice Patterns

### 8.1 Generic Helpful Narrator

The voice praises the question, anticipates every possible objection, explains obvious points, and closes with an offer to continue. This is service behavior, not authorial voice.

### 8.2 No Stable Preference

A human writer usually has recurring preferences:

- direct or exploratory openings
- short or winding explanations
- dry or warm humor
- concrete or conceptual analogies
- frequent or rare first person
- strong or cautious claims

Generic prose changes style to fit a template but lacks stable judgment within the piece.

### 8.3 Forced Personality

Random fragments, slang, typos, profanity, or unusual synonyms do not create voice. They create noise when the choices do not match the writer, audience, or subject.

## 9. Genre Mismatch

A passage may sound artificial because it uses the wrong conventions.

Examples:

- A troubleshooting guide written like a motivational essay
- A white paper full of dramatic one-line paragraphs
- A personal message with formal transitions
- A news story that delays the central fact
- An academic section with marketing adjectives
- A product description that explains every feature at textbook length

Judge style against genre before judging it against a general human baseline.

---

# PART III: A Responsible Detection Framework

## 1. What the Framework Can Conclude

Use four labels:

1. **Genre-consistent:** The passage fits normal human variation for its form.
2. **Formulaic:** The passage relies heavily on generic patterns but may be human, AI-assisted, or poorly edited.
3. **AI-associated pattern cluster:** Several features align with common model output. Authorship remains unproven.
4. **Provenance concern:** Style changes combine with external evidence such as missing drafts, unverifiable citations, impossible revision timing, or inconsistent source knowledge.

Never label a person dishonest from style alone.

## 2. Two-Stage Review

### Stage A: Mechanical Pattern Scan

Measure or count:

- Mean sentence length
- Sentence-length standard deviation
- Sentence-length coefficient of variation
- Paragraph-length variation
- Repeated sentence openers
- Transition-opener density
- Triad frequency
- Hedge density
- Passive construction rate
- Abstract-noun density
- Repeated rhetorical templates
- Lexical diversity
- Function-word profile
- Pronoun consistency
- Citation placement
- Concrete-detail frequency

### Stage B: Human Reading

Ask:

- Does the writer make a clear judgment?
- Do examples change the reasoning?
- Does the prose show knowledge of the actual situation?
- Does uncertainty match the evidence?
- Does the rhythm fit the genre?
- Are transitions logical or merely verbal?
- Does the writer preserve real constraints and tradeoffs?
- Does the document sound like one person throughout?
- Does it match the writerâ€™s earlier work?
- Can the writer explain the argument and sources?

The human review should carry more weight than a lexical blacklist.

## 3. Recommended Metrics

These metrics are indicators, not universal thresholds.

### 3.1 Sentence-Length Variation

Calculate:

`coefficient of variation = sentence-length standard deviation / mean sentence length`

A low value may indicate flat rhythm, but instructions and legal clauses may legitimately be uniform. Compare the result with the genre corpus.

### 3.2 Repeated Opener Rate

Count how many sentences begin with the same one to three words or the same grammatical form.

Examples:

- â€œThis approachâ€¦â€
- â€œThis methodâ€¦â€
- â€œThis systemâ€¦â€
- â€œBy doing soâ€¦â€
- â€œThrough thisâ€¦â€

Flag repeated patterns, not necessary repeated terms.

### 3.3 Transition Density

Count formal transition words per 1,000 words. Review whether each one states a real relationship.

### 3.4 Triad Rate

Count three-part lists, three stacked adjectives, and three parallel clauses. A high rate across a short passage may indicate template dependence.

### 3.5 Abstract-to-Concrete Balance

Review nouns in context.

Abstract:
innovation, efficiency, transformation, flexibility, excellence

Concrete:
SRAM, invoice, heat sink, Monday deadline, 32-channel input, cracked hinge

Technical writing can use many abstractions, but important claims should eventually connect to an observable mechanism, component, event, or measurement.

### 3.6 Hedge Density

Count words such as may, might, could, perhaps, generally, potentially, arguably, likely, appears, seems, suggests.

Then judge whether the caveats are:

- required by evidence
- duplicated
- hiding a conclusion
- absent where uncertainty exists

### 3.7 Structural Repetition

Label each sentence by function:

- claim
- reason
- example
- evidence
- qualification
- contrast
- transition
- implication
- instruction
- reaction

Long runs of the same pattern can reveal formulaic construction even when sentence lengths differ.

### 3.8 Source Traceability

For factual writing, count how many externally verifiable claims have:

- a named source
- a citation
- a date
- a clear distinction between fact and inference

Fabricated or irrelevant citations are more serious than generic style.

## 4. Corpus-Relative Thresholds

Do not use fixed rules such as â€œsentence variation below X means AI.â€ Use the genre corpus.

A practical method:

1. Calculate each metric across the reference samples.
2. Find the genre mean and spread.
3. Flag a passage only when several metrics fall far outside the genre range.
4. Review the passage manually.
5. Compare it with the writerâ€™s known work.
6. Seek process evidence before drawing an authorship conclusion.

A single unusual metric may reflect skill, disability, translation, technical convention, or a strict assignment format.

## 5. Weighted Review Score

Score each dimension from 0 to 4.

| Dimension | 0 | 2 | 4 |
|---|---|---|---|
| Genre fit | Strong fit | Mixed | Conventions repeatedly mismatched |
| Lexical naturalness | Specific, ordinary wording | Some inflated language | Dense stock vocabulary |
| Sentence variety | Function and rhythm vary naturally | Some repetition | Repeated balanced templates |
| Paragraph variety | Thought-driven shape | Moderately uniform | Lockstep paragraph formula |
| Specificity | Details affect reasoning | Some useful details | Broad claims and decorative detail |
| Agency | Actors and mechanisms are clear | Occasional vague agency | Repeated false agency |
| Epistemic control | Certainty matches evidence | Some overclaiming or hedging | Systematic certainty mismatch |
| Voice stability | Recognizable stance and judgment | Uneven | Generic helpful narrator |
| Source traceability | Claims are verifiable | Some weak attribution | Citations absent, irrelevant, or unclear |
| Writer consistency | Matches prior work | Some change | Sharp unexplained style shift |

Interpretation:

- **0 to 10:** little stylistic concern
- **11 to 20:** revise for clarity and genre fit
- **21 to 29:** strong formulaic pattern cluster
- **30 to 40:** investigate process and provenance before making any claim

The score is a review aid. It is not a probability that AI wrote the text.

## 6. False-Positive Risks

Be especially careful with:

- Non-native English writers
- Students trained in five-paragraph essays
- Technical instructions
- Legal and regulatory language
- Writers using accessibility templates
- Short passages
- Highly edited corporate copy
- Translated text
- Writers with limited vocabulary
- Neurodivergent writers who prefer repeated structures
- Assignments that force uniform paragraph patterns

A detector that punishes grammatical regularity can mistake careful human writing for AI.

## 7. Stronger Authorship Evidence

When authorship matters, prioritize:

- Draft history
- Version-control records
- Notes and outlines
- Source annotations
- Document metadata
- Time-stamped revisions
- Oral explanation
- Ability to reproduce the reasoning
- Consistency with prior work
- Verified citations
- Clear disclosure of permitted AI assistance

These forms of evidence address process rather than guessing from style.

---

# PART IV: The Human Writing Method

## 1. Start with a Voice Brief

Before drafting, answer:

- Who is speaking?
- Who is reading?
- What does the writer know firsthand?
- What does the reader already know?
- What judgment must the writer make?
- What action or understanding should follow?
- What emotional temperature fits?
- How formal should the relationship feel?
- Which style habits belong to the writer?
- Which habits should never appear?

A useful voice brief is concrete:

> A technically informed college student explaining a semiconductor tradeoff to a business reader. Direct, curious, and confident without sounding absolute. Uses specific hardware examples. Prefers medium-length sentences, occasional dry humor, and no em dashes.

## 2. Separate Content from Style

Draft the content skeleton first:

1. Main claim
2. Evidence
3. Mechanism
4. Limitation
5. Consequence
6. Reader action

Then choose the form. Styling an unclear idea only makes the confusion sound polished.

## 3. Use a Style DNA Card

Set each trait on a five-point scale.

| Trait | 1 | 5 |
|---|---|---|
| Formality | casual | formal |
| Compression | expansive | compressed |
| Emotional temperature | cool | warm |
| Sentence motion | clipped | flowing |
| Certainty | exploratory | decisive |
| Humor | none | frequent |
| First-person presence | absent | central |
| Technical density | plain | specialist |
| Narrative presence | abstract | scene-led |
| Reader address | distant | direct |

Keep the card stable through the document unless the genre requires a deliberate shift.

## 4. Draft Through Decisions

Human writing becomes recognizable when the writer chooses:

- which fact deserves the first sentence
- which example carries the argument
- where to qualify a claim
- what can remain unstated
- what the reader may resist
- which tradeoff matters
- where the paragraph should stop

Do not ask only whether a sentence is grammatical. Ask what decision it reflects.

## 5. Revise in Separate Passes

### Pass 1: Argument

- Is the main point clear?
- Does each paragraph advance it?
- Is any section present only because the template expects it?
- Does the conclusion do more than repeat the introduction?

### Pass 2: Evidence

- Does every important factual claim have support?
- Are details accurate and consequential?
- Are facts separated from inference?
- Are limitations specific?

### Pass 3: Structure

- Do paragraph lengths follow thought?
- Are examples placed near the claims they support?
- Does the document spend too long announcing itself?
- Are lists used only when they improve retrieval or sequence?

### Pass 4: Sentence Function

Label each sentence. Break repeated claim-explanation pairs. Add an example, qualification, implication, or direct statement where needed.

### Pass 5: Diction

Replace:

- inflated verbs with observable actions
- abstract nouns with named objects or decisions
- broad adjectives with measurements
- stock transitions with logical connections
- corporate language with ordinary English

### Pass 6: Rhythm

Read aloud.

- Shorten sentences that hide the point.
- Combine sentences that sound choppy.
- Let one long sentence carry a connected chain of thought.
- Use a short sentence only when it deserves emphasis.
- Avoid manufacturing variation with random fragments.

### Pass 7: Voice

Check the style DNA card.

- Would this writer use this word?
- Is the level of certainty consistent?
- Does the humor belong?
- Does the prose sound like the same person at the beginning and end?
- Has the edit removed every trace of personality?

### Pass 8: Sanitizer Scan

Review lexical, phrase, structural, and rhythm patterns from Part II. Revise clusters, not isolated words.

---

# PART V: Universal Guidelines

## 1. Lead with Information

Open with the fact, claim, decision, scene, or request. Do not begin by praising the topic or announcing that it matters.

## 2. Name the Actor and Action

Prefer:

> The validation team reran the thermal test at 85Â°C.

Over:

> The thermal test was rerun to ensure robust performance.

Passive voice remains useful when the actor is unknown, irrelevant, or deliberately omitted. Use it by choice.

## 3. Explain Mechanisms

Do not stop at â€œimproves efficiency.â€ State what changes.

> The integrated SRAM keeps the audio workload on chip, reducing external-memory traffic and avoiding another device on the board.

## 4. Use Details That Carry Weight

A detail should establish scale, cause, sequence, credibility, or scene. Remove decorative specificity.

## 5. Vary Function Before Length

A six-word sentence inserted into a flat paragraph does not create voice. Change what sentences do.

## 6. Let Paragraphs Follow Thought

Start a new paragraph when:

- the speaker changes
- the time changes
- the evidence changes
- the argument turns
- the reader needs a pause
- the action moves

Do not target a fixed paragraph length.

## 7. Make Calibrated Judgments

Replace vague neutrality with evidence-based judgment.

> The cheaper processor saves money only in the base configuration. Once the design adds external memory and a second DSP, the integrated part may cost less at the system level.

## 8. Keep Necessary Technical Language

Do not replace a precise term merely because it sounds formal. â€œPerplexity,â€ â€œlatency,â€ â€œheteroscedasticity,â€ and â€œfiduciary dutyâ€ carry specific meanings. Remove jargon only when it adds status rather than information.

## 9. Avoid Automatic Triads

Use the number of examples the point requires. One strong example often beats three thin ones.

## 10. Remove Service Phrases

Cut automatic praise, permission, reassurance, and closing offers when they do not serve the relationship.

## 11. Do Not Add Fake Imperfection

Do not insert:

- random typos
- incorrect punctuation
- forced slang
- invented memories
- fake personal opinions
- irrelevant fragments
- unusual synonyms chosen only for surprise

These choices damage quality and may misrepresent the writer.

## 12. Blend Influences, Not Signatures

Use broad craft qualities from several writers. Do not copy recognizable phrases, sentence patterns, recurring imagery, or comic routines from one author.

## 13. Keep a House Style Separate from Human Style

A house rule can ban em dashes, transition openers, or certain closings. That does not make the rule universal. Record house preferences so they do not get mistaken for evidence of human authorship.

### Sanitizer House Rules

- No em dashes
- No double hyphen used as an em dash
- No generic assistant praise
- No unprompted closing offer
- No emoji in professional prose
- No corporate filler
- No transition word used only to introduce another sentence
- No dramatic one-line ending unless the content earns it

---

# PART VI: Genre Profiles and Author Blends

The author blends below describe transferable craft qualities. They are not instructions to reproduce any writerâ€™s exact style.

## 1. General Narrative Fiction

### Purpose

Make the reader experience a sequence of events through selection, not exhaustive description.

### Blend

- **Jane Austen:** social observation and indirect characterization
- **Robert Louis Stevenson:** physical movement and scene momentum
- **Mark Twain:** spoken ease and selective comic judgment

### Voice Recipe

Use a clear narrator who notices behavior before explaining character. Keep physical action easy to follow. Let one unusual observation reveal the narratorâ€™s personality.

### Structure

1. Begin with a disturbance, desire, or social pressure.
2. Place the character in a specific physical setting.
3. Let action or dialogue expose the conflict.
4. Delay explanation until the reader has something to interpret.
5. End the scene on a changed condition, not a summary.

### Rhythm

Use medium sentences for observation, short sentences when a choice lands, and longer sentences when action or thought gathers momentum.

### Detail

Choose two or three sensory details with consequences. The wet receipt matters if the character can no longer return the item. The flickering light matters if it hides a face. Avoid cataloging the room.

### Avoid

- Weather-only openings
- Explaining an emotion immediately after showing it
- Adjective stacks
- Dialogue that exists only to deliver background
- A moral attached to the end of the scene

### Original Example

> Maya noticed the missing laptop when the projector woke up. The HDMI cable lay across the table, still warm from someoneâ€™s hand, and every chair in the lab faced her as if she had planned the demonstration this way.

The sentence gives an event, a physical clue, and social pressure before explaining what Maya feels.

## 2. Suspense and Action

### Blend

- **Arthur Conan Doyle:** evidence placed before interpretation
- **Jack London:** physical consequence and environmental pressure
- **H. G. Wells:** clear spatial logic during unusual events

### Voice Recipe

Report what the viewpoint character can perceive. Let the reader calculate danger from concrete facts. Withhold answers, not basic geography.

### Structure

- Establish where people and objects are.
- Introduce one anomaly.
- Let the character test an assumption.
- Escalate through consequences.
- Reveal information that changes the next action.

### Rhythm

Use short clauses during immediate danger, but avoid turning every sentence into a fragment. Longer sentences can track motion across space when the sequence remains clear.

### Avoid

- â€œSuddenlyâ€ before every event
- Vague danger words
- Characters ignoring obvious evidence
- Artificial cliffhangers
- Hiding information the viewpoint character already knows

## 3. Memoir and Personal Essay

### Blend

- **Joan Didion:** exact physical facts and controlled self-observation
- **Mark Twain:** conversational timing and willingness to admit absurdity
- **Virginia Woolf:** movement between present perception and memory

### Voice Recipe

Write from one personâ€™s limited knowledge. Keep the contradiction. A personal essay becomes generic when it rushes to turn experience into a universal lesson.

### Structure

1. Open with a concrete memory, object, or recurring problem.
2. Move between event and reflection.
3. Let the meaning change as the essay progresses.
4. Include a detail that complicates the writerâ€™s preferred self-image.
5. End on an image, unresolved tension, or revised understanding.

### Rhythm

Allow the widest range here. Short admissions can sit beside long reflective sentences. The variation should follow thought, not a formula.

### Avoid

- â€œThis experience taught meâ€
- Universal â€œweâ€ claims
- Perfect hindsight
- Invented dialogue presented as exact
- A tidy inspirational ending

### Original Example

> I told everyone I joined the project because I liked rockets. That was true in the same way it was true that I went to the meetings for the free pizza. I stayed because the first ground-station board failed in three different ways, and none of us wanted to let it win.

## 4. Explanatory Nonfiction

### Blend

- **Charles Darwin:** mechanism, evidence, and precise qualification
- **George Orwell:** plain wording and resistance to prefabricated phrases
- **Richard Feynman:** explanation built around what physically happens

### Voice Recipe

Assume the reader is intelligent but unfamiliar with the mechanism. Begin with the concrete problem. Explain cause and effect in the order the system experiences them.

### Structure

1. State the question or practical problem.
2. Give the simplest accurate model.
3. Walk through the mechanism.
4. Add a concrete example.
5. Name the boundary where the simple model stops working.
6. State why the explanation matters.

### Rhythm

Use mostly medium sentences. Insert a short sentence when a misconception needs to be corrected. Use longer sentences only when several causal steps belong together.

### Avoid

- Dictionary openings
- â€œIn todayâ€™s worldâ€
- Analogies that distort the mechanism
- A list of benefits without causal explanation
- Pretending exceptions do not exist

### Original Example

> A capacitor does not block all current. It resists changes in voltage by storing charge on two conductors. At low frequency, the voltage has enough time to build across the capacitor, so little current continues through the branch. At high frequency, the voltage reverses before much charge accumulates, and the capacitor passes more of the changing signal.

## 5. Analytical and White-Paper Writing

### Blend

- **Ida Tarbell:** evidence accumulated around named actors and decisions
- **George Orwell:** plain diction and suspicion of abstract claims
- **Michael Lewis:** a concrete case used to introduce a larger system

### Voice Recipe

Write as an informed analyst making a decision easier. The prose should explain tradeoffs rather than advertise a predetermined answer.

### Structure

1. Open with the decision or problem.
2. Establish the relevant constraints.
3. Compare options using the same criteria.
4. Explain the mechanism behind each difference.
5. State the system-level implication.
6. Name limitations and conditions.
7. Give the recommendation or decision rule.

### Rhythm

Use medium-length explanatory sentences, shorter statements for conclusions, and occasional longer sentences for connected tradeoffs. Do not end every subsection with a slogan.

### Evidence

Prefer:

- component counts
- latency
- memory requirements
- channel counts
- power
- cost categories
- software support
- validation status
- integration constraints

### Avoid

- Marketing adjectives
- Repeating the executive summary in every section
- Treating a feature list as analysis
- Hidden comparison criteria
- Claims of lower cost without a bill-of-material mechanism

### Original Example

> The lower-cost processor appears cheaper at the chip level, but the comparison changes once the design requires external memory, a companion DSP, and additional networking. The integrated device carries a higher unit price and removes three cost centers from the board. For systems that need all three functions, component price alone gives the wrong answer.

## 6. Persuasive and Argumentative Writing

### Blend

- **Frederick Douglass:** moral clarity anchored in concrete fact
- **Abraham Lincoln:** compressed reasoning and controlled repetition
- **George Orwell:** direct claims and plain words

### Voice Recipe

State the conclusion early. Give the strongest reason first. Represent the best counterargument accurately, then answer it with evidence or principle.

### Structure

- Claim
- Strongest reason
- Evidence
- Counterargument
- Response
- Consequence
- Specific action

### Rhythm

Use shorter sentences for claims and decisions. Let evidence occupy more space than rhetoric.

### Avoid

- False urgency
- Insults
- Straw-man objections
- Repeated â€œnot X but Yâ€ constructions
- Moral language unsupported by facts

## 7. Academic and Research Writing

### Blend

- **Darwin:** cautious inference tied to observation
- **Strunk:** removal of needless phrasing
- **Modern journal structure:** claim, method, evidence, limitation

### Voice Recipe

Make the reasoning inspectable. Discipline-specific language is welcome when it carries technical meaning. Formality should not erase actors, methods, or decisions.

### Structure

1. Research question
2. Existing gap
3. Method
4. Result
5. Interpretation
6. Limitation
7. Implication

### Rhythm

Longer sentences are acceptable, particularly when they express conditions or distinctions. Vary clause structure and avoid hedge stacking.

### Better Academic Caution

Weak:

> It could perhaps be suggested that the intervention may potentially improve retention.

Better:

> Retention increased in the intervention group, although the small sample prevents a reliable estimate of the effect size.

### Avoid

- â€œThe literature is vastâ€
- â€œMore research is neededâ€ without specifics
- Nominalization chains
- Citations detached from claims
- Treating correlation as mechanism
- Inflated novelty claims

## 8. Technical and Instructional Writing

### Blend

- **Strunk:** economy
- **Federal plain-language practice:** reader-first organization
- **Microsoft documentation convention:** one action per step

### Voice Recipe

Help the reader complete a task correctly. Predictability is an advantage here. Do not force narrative variation into a sequence that must be followed exactly.

### Structure

1. Prerequisites
2. Safety or data-loss warning
3. Numbered steps
4. Expected result
5. Troubleshooting branch
6. Recovery or rollback

### Sentence Rules

- Start each step with a verb.
- Name the exact menu, button, pin, command, or file.
- Put conditions before the action when they change what the reader should do.
- Keep one main action per numbered step.
- Separate explanation from the step when it would interrupt execution.

### Avoid

- Encouragement between steps
- Theory before the task
- Unnamed pronouns such as â€œitâ€ when several objects are present
- Hidden prerequisites
- Vague results such as â€œThe system should workâ€

## 9. Business Email, Memo, and Professional Communication

### Blend

- **News writing:** conclusion first
- **William Zinsser:** plain, warm clarity
- **Benjamin Franklin:** practical reasoning and specific requests

### Voice Recipe

Respect the readerâ€™s time without sounding cold. Put the decision, request, deadline, or problem in the first two sentences.

### Email Structure

1. Reason for writing
2. Necessary context
3. Specific request or decision
4. Date, owner, or next step
5. Natural close

### Memo Structure

- Decision
- Why it matters
- Evidence
- Risks
- Recommendation
- Owners and dates

### Avoid

- â€œI was just wondering if maybeâ€
- Long gratitude before the request
- Corporate filler
- â€œPlease do not hesitateâ€
- Repeating the subject line in the opening
- A summary that restates a five-sentence email

## 10. Journalistic and News Writing

### Blend

- **Associated Press convention:** fact-forward reporting
- **Ida Tarbell:** attribution and documentary detail
- **Hemingwayâ€™s reporting discipline:** clear nouns and verbs

### Voice Recipe

Put the most newsworthy verified fact first. Attribute disputed claims. Separate reporting from interpretation.

### Structure

1. Lede
2. Key supporting fact
3. Attribution
4. Context
5. Additional detail in descending importance

### Avoid

- Scene-setting before the news
- Unattributed judgment
- â€œShockingâ€ or â€œhistoricâ€ without evidence
- Chronological order when importance is clearer
- A conclusion that tells the reader how to feel

## 11. Marketing and Product Writing

### Blend

- **David Ogilvyâ€™s direct-response discipline:** clear benefit and evidence
- **Journalistic specificity:** concrete features and proof
- **Plain-language practice:** words customers use

### Voice Recipe

Describe the customer problem, the product action, and the resulting benefit. Marketing becomes generic when it praises the product without showing what changes for the buyer.

### Structure

- Customer problem
- Product mechanism
- Measurable or observable benefit
- Evidence
- Constraint or fit
- Call to action

### Better Product Claim

Weak:

> A seamless, innovative platform that transforms your workflow.

Better:

> Review schematics, assign comments, and export the approved revision from one project file instead of passing three PDFs through email.

### Avoid

- Superlatives without evidence
- Feature dumping
- Fake urgency
- Universal customer claims
- Empty emotional language
- Turning every heading into a slogan

## 12. Conversational, Chat, and Social Writing

### Blend

- **Pre-2020 personal blogs:** direct idea-to-reader connection
- **Natural correspondence:** contractions and incomplete shared context
- **Twain:** spoken cadence without forced slang

### Voice Recipe

Write to one person or one identifiable community. Keep only the context they need.

### Rhythm

Shorter sentences are normal. Fragments can work. A longer sentence should sound like a person finishing a thought, not a press release entering a chat window.

### Avoid

- Formal transition words
- Balanced mini-essays in reply to a simple question
- Generic encouragement
- Excessive bullets
- A customer-service closing when the relationship is personal

## 13. Speeches and Presentations

### Blend

- **Lincoln:** compression and controlled parallelism
- **Frederick Douglass:** escalation through evidence and moral stakes
- **Churchill:** memorable structure used selectively, not every sentence

### Voice Recipe

Write for the ear. The audience cannot reread the previous clause. State one idea at a time, repeat key language with purpose, and use concrete transitions.

### Structure

1. Immediate reason the audience should listen
2. One central idea
3. Two or three supporting movements
4. A concrete example or story
5. A clear final action or thought

### Rhythm

Read aloud. Alternate short claims with longer explanations. Use repetition at major turns only.

### Avoid

- Dense citations spoken aloud
- Long nested clauses
- Slide language copied into the speech
- A separate â€œin conclusionâ€ announcement
- Ending with a vague inspirational statement

---

# PART VII: Author-Blend Library

Use this table to build new profiles.

| Writer or tradition | Transferable qualities | Best uses | Risk when overused |
|---|---|---|---|
| Jane Austen | Social inference, indirect characterization, precise irony | Narrative, personal observation | Overly balanced clauses or mannered wit |
| Mark Twain | Spoken cadence, comic timing, concrete comparison | Narrative, essays, conversational prose | Forced folksiness |
| Robert Louis Stevenson | Scene motion, physical detail, adventure pacing | Narrative, suspense | Decorative atmosphere |
| Arthur Conan Doyle | Evidence order, observation, controlled revelation | Mystery, case studies, explanation | Mechanical clue sequencing |
| Jack London | Environmental pressure, physical consequence | Action, survival narrative | Excessive bluntness |
| Charles Darwin | Patient mechanism, evidence, precise qualification | Science, analysis, academic prose | Long accumulation without signposts |
| Benjamin Franklin | Practical clarity, examples, reader usefulness | Advice, business, explanation | Overly tidy moral lessons |
| Ida Tarbell | Documentary detail, named actors, fact accumulation | Journalism, white papers | Evidence without enough synthesis |
| Frederick Douglass | Moral clarity, concrete testimony, purposeful repetition | Argument, speech | Constant high intensity |
| Abraham Lincoln | Compression, logical sequence, restrained parallelism | Speeches, persuasion | Artificial solemnity |
| George Orwell | Plain words, active agency, hostility to stale phrases | Expository, analytical, political prose | Treating every abstraction as illegitimate |
| William Strunk | Compression and sentence control | Editing, technical writing | Choppy over-editing |
| William Zinsser | Warm clarity and personal nonfiction voice | Business, essays, explanation | Casualness in formal contexts |
| Virginia Woolf | Interior motion, attention shifts, flowing syntax | Memoir, reflective narrative | Obscured logical sequence |
| Ernest Hemingway | Omission, concrete action, restraint | Narrative, reporting | Flat minimalism or parody |
| Joan Didion | Exact physical detail, controlled distance, implication | Personal essay, analysis | Self-conscious coolness |
| Kurt Vonnegut | Clear desire, humane directness, structural economy | Storytelling, speeches | Cute one-liners |
| Richard Feynman | Mechanism-first explanation, physical intuition | Technical explanation | Analogy replacing rigor |
| David Ogilvy | Benefit-led copy and evidence | Marketing | Sales pressure or oversimplification |

A blend should combine complementary qualities. Three examples:

### Narrative Blend

Austenâ€™s social observation + Stevensonâ€™s motion + Twainâ€™s spoken ease

### Explanatory Blend

Darwinâ€™s causal patience + Orwellâ€™s plain diction + Feynmanâ€™s physical intuition

### White-Paper Blend

Tarbellâ€™s evidence discipline + Zinsserâ€™s clarity + journalistic conclusion-first structure

---

# PART VIII: Reusable Style Recipes

## 1. Narrative Recipe

> Write from one limited viewpoint. Open with a disturbance or desire, not background. Use physical action to establish the scene, dialogue to reveal social pressure, and reflection only after the reader has evidence. Blend precise social observation, clear motion, and occasional conversational humor. Vary sentence function and length according to action. Do not explain emotions already visible in behavior. End the scene with a changed condition.

## 2. Explanatory Recipe

> Begin with the practical question. Give the simplest accurate model, then explain the mechanism in causal order. Use one concrete example and one boundary case. Blend patient evidence, plain wording, and physical intuition. Keep technical terms that carry meaning. Remove inflated language, decorative transitions, and benefit lists that lack mechanisms.

## 3. White-Paper Recipe

> Open with the decision the reader must make. Establish constraints and compare options using the same criteria. Explain system-level cost, performance, integration, and risk rather than listing features. Blend documentary evidence, clear business prose, and a concrete opening case. State assumptions, limitations, and the conditions under which the recommendation changes.

## 4. Academic Recipe

> State a narrow claim that a specialist can test. Tie each inference to evidence, use one level of caution, and name the limitation precisely. Keep discipline-specific terms but remove nominalized filler. Vary sentence structure while preserving formal clarity. Do not claim novelty, importance, or causality beyond the method.

## 5. Professional Email Recipe

> Put the reason for writing in the first sentence. Give only the context needed for the request. Name the action, owner, and deadline. Keep the tone warm but direct. Use contractions when the relationship allows them. Remove gratitude padding, corporate jargon, and generic closings.

---

# PART IX: Editing Worksheet

## 1. Content Check

- What is the main point in one sentence?
- What evidence changes the readerâ€™s understanding?
- Which claim is inference rather than fact?
- What real limitation should remain?
- Which paragraph could disappear without changing the argument?

## 2. Voice Check

- Who is speaking?
- What does this person care about?
- Which judgment sounds distinctly theirs?
- Does the certainty level remain stable?
- Would the writer say these words aloud?
- Did editing erase every personal preference?

## 3. Formula Check

- Does the piece restate the prompt?
- Does it announce its structure unnecessarily?
- Are formal transitions doing work?
- Are triads repeated?
- Do paragraphs have the same shape?
- Do several sentences use reversal templates?
- Does every section end with a slogan?
- Is the conclusion only a recap?

## 4. Specificity Check

- Are actors named?
- Are mechanisms explained?
- Are numbers meaningful?
- Are examples real and relevant?
- Are technical terms precise?
- Does each adjective have evidence?
- Does each citation support the exact claim?

## 5. Rhythm Check

Read the piece aloud and mark:

- places where the voice becomes monotonous
- long sentences that hide the point
- short sentences used only for drama
- repeated sentence openings
- paragraphs that stop at an arbitrary length
- fragments that feel forced

## 6. Genre Check

- Does the opening follow the genreâ€™s priority?
- Is the amount of context appropriate?
- Are lists, headings, and examples used in the expected way?
- Is the tone suitable for the relationship?
- Does the ending perform the genreâ€™s job?

---

# PART X: Compact Sanitizer Checklist

Before delivering prose:

- Cut throat-clearing.
- Answer before framing.
- Name the actor.
- Replace vague verbs with actions.
- Replace abstract claims with mechanisms.
- Keep technical terms that carry meaning.
- Remove stock transitions.
- Break repeated triads.
- Vary sentence function.
- Let paragraphs follow thought.
- Use evidence-bearing detail.
- Match certainty to evidence.
- Preserve true constraints and tradeoffs.
- Remove generic assistant language.
- Remove corporate filler.
- Remove unearned slogans.
- Remove em dashes under this house style.
- Do not add fake mistakes.
- Check the chosen genre profile.
- Verify every source.
- Treat detector scores as weak evidence.
- Use process evidence when authorship matters.

---

# PART XI: Research Bibliography and Source Map

## Public-Domain and Archival Corpora

- Project Gutenberg public-domain ebook collection
- Library of Congress digital manuscript collections
- Library of Congress Chronicling America newspaper archive
- National Archives historical documents
- Internet Archive public-domain scans
- Standard Ebooks public-domain editions
- HathiTrust public-domain volumes

## Style and Writing References

- William Strunk, *The Elements of Style*, original edition
- George Orwell, â€œPolitics and the English Languageâ€
- William Zinsser, *On Writing Well*
- Federal plain-language guidance
- Microsoft Writing Style Guide
- Purdue Online Writing Lab
- Associated Press style conventions

## Pre-2020 Web Prose

- Paul Graham essays published before 2020
- Named-author technical blogs with stable archives
- Established newspaper and magazine archives
- Government technical and public-information pages
- University research and writing-center pages
- Product manuals and developer documentation dated before 2020

## Stylometry Foundations

- Research on genre and authorship classification
- Cross-topic authorship attribution
- Function-word and n-gram analysis
- Vocabulary richness and sentence-length measures
- Lexical, syntactic, punctuation, and discourse features

## Modern Detection Limitations

Use recent peer-reviewed or primary research to understand:

- false positives
- domain shift
- model changes
- paraphrase sensitivity
- language bias
- non-native English bias
- short-text limitations
- the difference between pattern detection and authorship proof

---

# Final Principle

Human writing is not defined by messiness. It is defined by choice.

A real voice decides what matters, what can be left out, how certain a claim should be, which example carries the point, and where a thought ends. The Sanitizer should protect those decisions. It should not replace one formula with another.

