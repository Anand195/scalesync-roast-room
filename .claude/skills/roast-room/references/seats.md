# Seats

`roster.json` (one folder up) is the source of truth: every seat, its key, pillar, question, and scorecard dimension, plus the default board and how the board is picked. The seven seats that ship with the Roast Room:

| Seat | Agent | Pillar | Owns the question | Brain |
|---|---|---|---|---|
| Bezos | `council-bezos` | Strategy and decisions | Is this the right bet, and how reversible is it? | `brains/jeff-bezos/` |
| Graham | `council-graham` | Product and startups | Is this something people actually want, and is it growing? | `brains/paul-graham/` |
| Hormozi | `council-hormozi` | Offers, pricing, and sales | Will people pay, how much, and how do we close? | `brains/alex-hormozi/` |
| Gary V | `council-garyvee` | Marketing and attention | Where does the attention come from, and is it underpriced? | `brains/gary-vaynerchuk/` |
| Martell | `council-martell` | People, hiring, and founder time | Who does this, and what does it cost the founder's calendar? | `brains/dan-martell/` |
| Wickman | `council-wickman` | Operations and scaling | Can the business run this without the founder holding it together? | `brains/gino-wickman/` |
| Buffett | `council-buffett` | Money and capital | What does it do to cash, risk, and long-term value? | `brains/warren-buffett/` |

Brain paths are relative to `.claude/skills/roast-room/`. Seats added with `/newroaster` follow the same pattern: `council-<key>` and `brains/<slug>/`, listed in `roster.json`.

## Relevance weights

The Chair sets a weight per seat for each decision, before Round 1, and writes the reason in one line. Weights make the final score honest: a pricing call should lean on Hormozi, a hiring call on Martell.

| Weight | Meaning |
|---|---|
| 3 | This decision lives in the seat's pillar |
| 2 | The pillar is materially affected |
| 1 | The pillar is touched at the edges |

Every seat is at least 1. Exactly one or two seats get a 3.

## Quick council

`--quick` seats four from the board: the two highest-weight seats, the seat that guards the downside (Buffett or Bezos out of the box; otherwise the board's money, capital, or risk seat), and the seat most likely to disagree with the others (the Chair names why). Use quick for reversible, low-stakes calls. Full council for anything a founder cannot easily undo.

## Natural tensions to expect

- Bezos and Buffett (long horizon, downside first) against Hormozi and Gary V (speed to cash, volume, act now).
- Graham (do things that don't scale, stay close to users) against Wickman (systems, process, accountability).
- Buffett (stay in your circle, avoid leverage) against Gary V (bet on the underpriced platform now).
- Martell (buy back your time, hire early) against Graham and Buffett (stay small and frugal until it works).

Seats added with `/newroaster` append their own tension lines here.

If Round 1 comes back unanimous, the Chair should be suspicious and press the seat whose pillar is most at risk in Round 2.
