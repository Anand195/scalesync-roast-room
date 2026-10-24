# Roast Room · ScaleSync edition

![ScaleSync](app/public/brand/scalesync-logo.png)

Put a business decision to a simulated council, watch its discussion in a local browser room, and save the verdict as a PDF. This is a ScaleSync edition of [nateherkai/roast-room](https://github.com/nateherkai/roast-room). The original advisor material, example sessions, and MIT license remain. The advisor voices are simulations based on public work; the people shown are not affiliated with this project and do not endorse its answers.

**Live URL after starting:** [http://localhost:4730](http://localhost:4730). This is a local app on your computer. GitHub distributes its code; GitHub Pages cannot run its Node server or your signed-in Claude/Codex CLI. Keep the computer and local runner available while a council is working.

## Start in one command

You need Git, Node.js 20 or newer, and **one** signed-in local CLI:

- [Claude Code](https://code.claude.com/docs/en/quickstart): install it and run `claude auth login`.
- [Codex CLI](https://developers.openai.com/codex/cli): install it and run `codex login`.

```bash
git clone https://github.com/Anand195/scalesync-roast-room.git
cd scalesync-roast-room
npm run launch -- --runner auto
```

`auto` prefers signed-in Claude Code, then Codex CLI. To choose explicitly, use `--runner claude` or `--runner codex`. The launcher checks authentication, saves the choice in a git-ignored `.env`, starts the server, checks readiness, opens the browser, and prints the URL. It installs no npm dependencies. Add `--no-open` to keep the browser closed.

For a foreground server, put `COUNCIL_RUNNER=claude` or `COUNCIL_RUNNER=codex` in `.env`, then run `npm start`. The original default `viewer` mode still plays councils started by the `/roast-room` Claude Code skill. Optional `api` mode uses `ANTHROPIC_API_KEY`; see `.env.example`.

### Give this prompt to Claude Code or Codex

Copy the whole block into a terminal Claude Code or Codex chat. The assistant should finish setup and give you the usable URL:

```text
Set up and launch the ScaleSync edition of Roast Room from
https://github.com/Anand195/scalesync-roast-room.

Goal: I can type a new business decision into the local Roast Room webpage,
have it processed by my signed-in Claude Code or Codex CLI in the background,
choose that provider's model and effort, cancel a run if needed, watch the
council, and find the question and verdict in Past sessions.

1. Check that Git and Node.js 20+ are installed. Check `claude auth status`
   and `codex login status`. Use signed-in Claude Code if available;
   otherwise use signed-in Codex CLI. If neither is signed in, guide me
   through the appropriate CLI login, then continue. Never request or print
   an API token.
2. Clone the repository into a sensible folder, or use an existing clone.
   Do not overwrite user files. Read its README before running anything.
   Keep `.env` and `sessions/` out of Git.
3. From the repository root, run `npm run launch -- --runner auto` (or pass
   the selected runner explicitly). If port 4730 is occupied, identify the
   process and repository first; stop only a stale Roast Room instance that
   is safe to replace. Do not kill unrelated services.
4. Verify `http://localhost:4730/api/health` reports this repository and
   the chosen runner. Verify the homepage loads. Open
   `http://localhost:4730` in my browser.
5. Verify the page badge identifies Claude Code or Codex CLI. Verify Model
   and Effort selectors show that runner's choices. Tell me the exact live
   local URL and runner. Explain that I enter the decision, options, numbers,
   constraints, deadline, and lean; choose model, effort, Quick or Full;
   click “Convene the council”; then watch the result. Explain that Cancel
   council stops the running CLI while keeping the question in Past sessions,
   where completed runs can be replayed or downloaded as PDFs.
6. If anything fails, read `sessions/room-server.log` and the relevant
   `sessions/<id>/runner.log`, fix the actual issue, retry, and report what
   you verified. Do not claim a council was tested unless one completed.

This is a local web application. Report `localhost` as the live URL; do not
claim it is a public hosted service or expose it to the internet.
```

## Ask a question in the browser

1. Open [http://localhost:4730](http://localhost:4730). The badge identifies the active provider. The provider is selected when the server starts; use `npm run launch -- --runner claude` or `--runner codex` to choose another one after stopping the current server.
2. Write one decision: options, business context, revenue/cash/team if relevant, constraints, success target, deadline, and your current lean. Missing facts are marked as assumptions because the background council cannot pause to ask you.
3. Choose **Model** and **Effort**, or leave either at **CLI default**. Claude Code offers its current model aliases. Codex reads its local model cache to list visible models and each model's supported efforts; before that cache exists, the room offers built-in suggestions. Availability still depends on your CLI login and plan. These settings apply to the new council, not a run already in progress.
4. Choose **Quick** (four advisors, usually two rounds) or **Full** (about five to seven advisors, three rounds) and click **Convene the council**. One local CLI council runs at a time. A run may take several minutes and consumes your CLI plan usage.
5. Watch the cards and verdict appear. **Cancel council** stops the active Claude or Codex process, including its child processes on macOS/Linux. The cancelled question remains in **Past sessions**. Completed sessions can be replayed or downloaded as PDFs. The exact question, provider, model, effort, and status are saved in `sessions/<id>/request.json`; working notes, `verdict.md`, `verdict.json`, and runner output are in the same local folder. Sessions are ignored by Git.
6. Click **New question** for another decision. This is a question-to-verdict workflow. It does not yet provide a continuous chat thread or interactive follow-up within one council. To revisit a verdict, submit a new question with the earlier facts and what changed.

Example question:

> I run a coaching business at $30k a month with 15 clients at $2,000 each. Should I raise to $3,500 for everyone, raise only for new clients, or keep $2,000? Close rate is about 50%, I have $40k in cash, and success means $45k monthly by March. I lean toward raising for everyone. Please test that view.

## Use it from desktop AI chats

The dependency-free local MCP server `app/mcp.mjs` exposes `roast_room_start`, `roast_room_cancel`, `roast_room_wait`, `roast_room_status`, `roast_room_history`, and `roast_room_result`. A desktop chat can submit a question with optional model and effort, cancel its session, and read the same local result. Configure its stdio command as your Node executable followed by the absolute path to `app/mcp.mjs`. Keep the repository's `.env` set to `COUNCIL_RUNNER=claude` or `codex`. The MCP server starts the room if it is stopped.

For Codex CLI/Desktop:

```bash
codex mcp add roast-room -- node /absolute/path/to/scalesync-roast-room/app/mcp.mjs
```

For Claude Desktop, add a `roast-room` entry under `mcpServers` in `claude_desktop_config.json` (on macOS, `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "roast-room": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/scalesync-roast-room/app/mcp.mjs"]
    }
  }
}
```

Merge that entry into any existing configuration rather than replacing other servers. Restart the desktop app to load the tools. MCP configuration is optional for browser use.

## Compatibility with the original project

This repository retains the original `.claude/skills/roast-room/` and `.claude/agents/` structure, `npm start`, viewer mode, API mode, sample sessions, advisor brains, quote checker, PDF generation, and `/newroaster` skill. Our additions are the Claude/Codex local runners, saved web requests, desktop MCP connector, launcher, and ScaleSync branding.

The Git remote named `upstream` points to [nateherkai/roast-room](https://github.com/nateherkai/roast-room). Upstream changes should be reviewed and merged deliberately; do not overwrite ScaleSync branding or local runner changes. A recurring 15-day check reports new upstream commits and compatibility risks. It does not silently merge unreviewed code. See [docs/UPSTREAM.md](docs/UPSTREAM.md) for the local commands and review checklist.

## Troubleshooting and verification

| Symptom | Check |
|---|---|
| Login check fails | Run `claude auth status` or `codex login status` in your own terminal. Sign in with `claude auth login` or `codex login`. |
| Port 4730 is occupied | Run `curl http://localhost:4730/api/health`; stop the old instance only after identifying it. |
| Page starts but council does not | Open Past sessions, then check `sessions/<id>/request.json` and `runner.log`. The question remains saved even if the run fails. |
| Selected model or effort is rejected | Try **CLI default**, confirm the model is available to your account, and update the relevant CLI. Codex choices come from its local model cache when present. |
| Room not ready | Read `sessions/room-server.log`; verify Node 20+ and the selected `COUNCIL_RUNNER`. |
| Desktop tools absent | Check the MCP command's absolute paths and restart Claude Desktop or Codex Desktop. |

Run `npm run check` for offline structure and syntax checks. The upstream `npm run smoke` command makes a live Anthropic API call and requires an API key; use it only when testing `api` mode. For a real end-to-end check, submit a small **Quick** decision, wait for `verdict.json`, open it from Past sessions, and run:

```bash
python3 .claude/skills/roast-room/scripts/check_quotes.py sessions/<id>
```

A successful smoke check cannot guarantee future behavior of upstream updates, CLI authentication, model availability, or a user's local environment.

## Attribution and licenses

Original Roast Room by AI Automation Society: [nateherkai/roast-room](https://github.com/nateherkai/roast-room). Its MIT license and copyright notice remain in [LICENSE](LICENSE). The PDF builder bundles jsPDF (MIT) and Montserrat (SIL Open Font License); their license files remain beside the bundled assets. ScaleSync logo and icon were supplied for this edition. Advisor quotations are short source-attributed excerpts for commentary and education. The simulated advisors do not speak for the real people.
