# UI, UX, and customer flow review

Reviewed against [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Impeccable](https://github.com/pbakaus/impeccable), and [Anthropic frontend-design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md). The UI UX Pro Max design-system search and UX searches were run for this decision-support app, responsive overflow, and form feedback. Existing ScaleSync colors and the council-room visual language were retained.

## Changes made from the supplied screenshots

- The table scene and question form are separate layout sections. The table cannot cover the textarea or file drop zone.
- The header wraps its controls before they clip. Start council stays visible when the form is below the fold; provider, model, effort, Cancel council, and Past sessions remain visible during a run.
- On narrow phones, advisor portraits become a labeled grid. The full roster remains reachable without tiny overlapping nameplates.
- Ultra is a separate nine-seat, five-round option. Its high-token warning sits between the mode choice and the start action. The warning uses an SVG symbol rather than emoji decoration.
- The question field has an accessible name. Model and effort selects, mode choices, and header controls have at least 44-pixel touch height. Reduced-motion CSS remains active.
- The pending state now says the Chair is preparing the council, instead of leaving the disabled form looking like a second start action.

## Browser checks

Checked the local Chrome browser at 320, 375, 768, 1024, and 1470 CSS pixels: no horizontal document overflow, no stage/form overlap, and Start council and Past sessions remained inside the viewport. At 375 pixels, the seven default advisors displayed as a four-column labeled grid. Selecting Ultra revealed the warning before the submit button at every tested width. A real browser submission reached Claude Code with Sonnet and high effort, and the live header displayed all three values while its council files streamed in. The completed run displayed its action plan and produced a PDF containing the roadmap. Its Conversation panel appeared, and Start a new thread cleared the prior question. The [README preview](images/roast-room-desktop.png) is a capture of that live run.

Computed text colors were also checked against the existing dark surfaces: regular text had at least 11.67:1 contrast, muted text at least 6.96:1, and the Ultra warning text at least 13.06:1 in the sampled combinations. These exceed the 4.5:1 normal-text target in the requested design guidance.

The repeatable `npm run check` suite exercises runner arguments, persistence, cancellation, attachment validation, and the five-round Ultra watcher with 45 synthetic cards and an invalid eight-seat case. The saved synthetic run was also replayed in Chrome: all nine advisor portraits, 45 cards, Stress test, Final vote, nine final endorsements, and the action plan appeared. The fixture was then removed from Past sessions. Synthetic cards verify software handling; they do not claim to measure the quality of an AI-generated Ultra verdict.
