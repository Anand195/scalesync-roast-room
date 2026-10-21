---
name: newroaster
description: Use when someone wants to add a new advisor to the Roast Room, says "/newroaster", "add a roaster", "add a seat", "add [name] to the council", "build a seat for [name]", "I want [name] on my board", or wants their own advisor (themselves, a mentor, or any public figure) built from public work. Builds the seat the same way the original seven were built. It finds and fetches the person's public sources, extracts their frameworks, rules, positions, stories, and voice with parallel sub-agents, writes the brain, checks every quote is verbatim, writes the council agent, and registers the seat in the roster (on the default board if asked). Not for running a council (that is /roast-room).
argument-hint: "[full name] [--quick | --deep] [--pillar \"...\"] [--default]"
---

## What this does

Adds one seat to the Roast Room. A seat is three things, and this skill makes all three:

1. **A brain**: `.claude/skills/roast-room/brains/<slug>/`, eight files compiled from the person's public work, every quote verbatim with a source id.
2. **An agent**: `.claude/agents/council-<key>.md`, the sub-agent that reasons and talks like them from that brain.
3. **A roster entry**: one line in `.claude/skills/roast-room/roster.json`, so `/roast-room` and the room know the seat exists.

The raw sources stay in a local build folder that git ignores. Only the brain ships.

Build folder: `build/<slug>/` at the project root.

Read before the first run: `references/brain-spec.md` (the brain layout and its rules), `references/extract-prompt.md` (what each extraction agent gets), `references/agent-template.md` (the seat agent).

## Who can be a roaster

- **Public figures with a real body of public work**: essays, letters, books as they teach them in talks, long interviews where they are the main speaker, keynotes, their own channel or podcast. Living or historical.
- **The user, or someone who gave consent**: built from material the user provides (their posts, transcripts, notes). Use `--add` in step 3.
- **Not**: fictional characters, private people without their consent, or anyone whose public work is too thin. Under about 15 usable sources or 60,000 words, say so and offer `--quick` with a warning, or a different person.

The seat is a simulation, not the person. The agent says so if asked, and only quotes what is in its brain.

## Depth

| Flag | Sources | Words | Extraction agents | Use it for |
|---|---|---|---|---|
| `--quick` | 12 to 20 | 80k+ | 2 to 3 | Trying someone out |
| default | 30 to 50 | 250k+ | 4 to 6 | A seat you will actually use |
| `--deep` | 80+ | 500k+ | 8 to 12, in waves | Matching the original seven |

Quality beats count: one 90-minute keynote is worth ten 6-minute clips.

## Step 1: Who and what seat

From the user's message, get the person's full name. If anything below is missing, ask in one AskUserQuestion batch (at most four questions), offering your best guess as the first option:

1. **The pillar and the question the seat owns.** Propose one from what the person is known for, worded like the existing seats in `roster.json` (pillar: a few words; question: one plain question a founder would face). If an existing seat already owns that pillar, propose a sharper angle so the two seats argue instead of repeating each other.
2. **Default board?** Put them at the table for every council, or keep them on call (`--seats` and `ask`). If the default board already has nine seats, ask who they replace.
3. **Depth**: quick, standard, or deep (default standard).

Then fix the names: `key` (short lowercase, letters only, unique in the roster, usually the surname: `naval`, `drucker`), `slug` (`first-last`), `short` (how the room names them: "Naval"), and the scorecard `dimension` (a few words for what this seat scores, like "Leverage and long-term wealth").

Check the roster first: if the person already has a seat, stop and offer to refresh it instead (step 3 onward on the same slug; fetch skips sources already in `sources.json`).

## Step 2: Find sources

Use WebSearch to build a source list, best first. Look for:

- Their own site, blog, essays, newsletter archive, or letters (the richest text, with dates).
- Long talks and keynotes where they are the speaker.
- Long interviews and podcasts where they are the main guest (their own podcast counts).
- Their books as they teach them in public: author talks, interviews about the book, chapters they posted free. Never fetch pirated or paywalled book text.
- Recent material (last two years) so `positions.md` reflects current views, and a spread of years so changes of mind show up.

Skip clips under about 10 minutes, fan compilations, reaction videos, and pieces where someone else does most of the talking. Write the URLs to `<build>/urls.txt`, one per line, with a `# heading` line per group. Aim for the source count of the chosen depth plus about 20 percent, since some will fail.

## Step 3: Fetch

```bash
node .claude/skills/newroaster/scripts/fetch.mjs <build> --list <build>/urls.txt
```

Each source becomes `<build>/corpus/S001-<title>.md`, logged in `<build>/sources.json`. It prints `ok`, `skip`, `thin` (paywall or a JavaScript page), or `fail` per URL, then a manifest. YouTube uses yt-dlp when installed, otherwise YouTube's own captions. For local material the user gave you:

```bash
node .claude/skills/newroaster/scripts/fetch.mjs <build> --add path/to/file.md --title "..." --date 2024-05-01
```

If a source came back thin or failed, find a different copy (a transcript page, an archive.org copy) or replace it. A PDF without `pdftotext` is saved as `pending-*.pdf`: read it with the Read tool, save the text as a `.md`, then `--add` it. Re-run until the manifest meets the depth target, then open two or three corpus files to confirm they are clean text by the right person. Write the manifest line counts into your notes for the final report.

## Step 4: Extract (map)

Split the sources into batches of about 50,000 words each (a 90-minute talk is about 13,000; a long essay 5,000). Spawn one extraction agent per batch, in **one message**, in parallel, foreground: `subagent_type: general-purpose`, `model: sonnet`, with the prompt from `references/extract-prompt.md` (fill in the name, the seat's pillar and question, the batch's source ids and file paths, and the notes file to write). Run at most six at a time; for `--deep`, run them in waves.

Each agent writes `<build>/notes/batch-NN.md`. Wait until every agent has reported. When all are back, check every note quote:

```bash
node .claude/skills/newroaster/scripts/check_quotes.mjs <build> <build>/notes
```

Fix what it reports: correct a wrong source id, delete a quote it cannot find. Notes with no verifiable quote can stay as paraphrase, marked "inferred from S0xx".

## Step 5: Write the brain (reduce)

Create `.claude/skills/roast-room/brains/<slug>/`. Write `sources.md` with the script:

```bash
node .claude/skills/newroaster/scripts/fetch.mjs <build> --sources-md .claude/skills/roast-room/brains/<slug>/sources.md --name "Full Name"
```

Then spawn three writer agents in one message, in parallel (`general-purpose`, default model). Each reads every notes file plus `references/brain-spec.md` and writes its files into the brain folder, following the spec's budgets and rules:

- Writer A: `frameworks.md`, `principles.md`, and `books.md`.
- Writer B: `positions.md` and `stories.md`.
- Writer C: `voice.md`.

Tell each writer the seat's pillar and question, the build folder (so it can open a corpus file to check a quote's context), and that every quote must be copied exactly from the notes with its source id. Writers write only their own files.

When they are back, write `_hot.md` yourself from the six finished files (the spec lists what goes in it, including "where this lens misfires"). Then check the whole brain:

```bash
node .claude/skills/newroaster/scripts/check_quotes.mjs <build> .claude/skills/roast-room/brains/<slug>
```

Fix until it passes: every quote verbatim, every id right. Read `_hot.md` once more as the agent will: it should tell you how this person decides, in their words, in under 800 words.

## Step 6: Write the agent

Write `.claude/agents/council-<key>.md` from `references/agent-template.md`. Fill every bracket from the brain: the lens (five or six questions this person asks of any decision), how they talk (from `voice.md`), how they debate (name their natural opponents among the seats in `roster.json` and what they concede, from "where this lens misfires"), and the never-list. The description names the pillar, the source count and what the brain is built from, and the trigger phrases ("what would [name] say").

## Step 7: Register the seat

```bash
node .claude/skills/newroaster/scripts/add_seat.mjs --key <key> --name "<Full Name>" --short "<Short>" --slug <slug> --pillar "<pillar>" --question "<question>" --dimension "<dimension>" [--default] [--swap <key>]
```

It refuses if the agent file or a brain file is missing. `--default` adds the seat to the default board; `--swap <key>` takes another seat off it in the same move. Then:

- Add one or two "natural tension" lines for the new seat to `.claude/skills/roast-room/references/seats.md` (who they will clash with, and over what).

## Step 8: Test the seat

New agent files load when Claude Code starts, so test with the fallback the council itself uses: spawn `general-purpose` with `Read .claude/agents/council-<key>.md and follow it as your instructions for this whole task. Only read files; do not write anything.` followed by the single-seat consult prompt from `.claude/skills/roast-room/references/round-prompts.md`, on a short sample decision in the seat's pillar. Then check its answer:

- It sounds like the person (compare with `voice.md`), speaks in the first person, and never claims to be them.
- It names frameworks with source ids, and every quote passes `check_quotes.mjs` (save the answer to `<build>/test-consult.md` and run the checker on it).
- It owns its pillar instead of giving generic advice.

If it fails, fix the agent or `_hot.md` and test again, once.

## Step 9: Report

Tell the user, in under 150 words:

- Who was added, their pillar and question, and whether they are on the default board.
- The brain: sources, words, years covered, and the files written.
- How to use them now: `/roast-room ask <key> ...` for one answer, `/roast-room --seats <key>,buffett,... ...` to seat them, and `/roast-room board` to change the default board.
- One line: restart Claude Code (or open a new session) so the seat loads as its own agent type; until then the council uses the fallback automatically.
- One line: the room draws them a simple cartoon bust in their color. For a real portrait, save a square image with a transparent background as `app/public/portraits/<key>-base.png` (`.webp` or `.jpg` also work). Add `-open`, `-mid`, and `-blink` versions of the same image to make the mouth move.

## Without sub-agents (Codex or a runtime that cannot spawn agents)

Run steps 4 and 5 yourself, one batch at a time: extract a batch into its notes file, then move to the next. Write the brain files one at a time from the notes. Everything else is the same.

## Rules

- Public and lawful sources only. The corpus stays in the build folder and is never committed or shared; the brain holds short quotes (under 45 words) and paraphrase, never book text.
- Every quote in the brain is verbatim and passes `check_quotes.mjs`. A line with no source is inference and says so.
- Do not touch the other seats' brains or agents. Only `roster.json`'s `"seats"` and `"default"` change, through `add_seat.mjs`.
- Plain English in everything you write yourself: short sentences, no em dashes, no filler.
- Cost: a standard seat is about 8 to 10 sub-agent runs. Say which depth you used.
