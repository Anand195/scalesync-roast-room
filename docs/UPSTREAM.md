# Upstream compatibility workflow

The original project is [nateherkai/roast-room](https://github.com/nateherkai/roast-room). This repository keeps the original Git history and tracks that project as the `upstream` remote. ScaleSync additions should be maintained as a small, reviewable layer.

Every 15 days:

1. Run `git fetch upstream main` and record `git rev-parse upstream/main`.
2. Check `git log --oneline HEAD..upstream/main` and `git diff --stat HEAD...upstream/main`. If there are no new commits, report that and stop.
3. Review the changed files against the ScaleSync touch points: `app/server.mjs`, `app/lib/watch.mjs`, `app/lib/seats.mjs`, `app/lib/local-runner.mjs`, `app/mcp.mjs`, `app/public/`, `app/scripts/`, `.env.example`, `package.json`, and `README.md`.
4. Create a branch from `main` and merge `upstream/main`. Resolve conflicts without dropping either upstream features or the local browser/CLI runner. Preserve the upstream license and attribution.
5. Run `npm run check`, `git diff --check`, and a real Quick council through the browser using both Claude and Codex runners when both are authenticated. Check saved `request.json`, `verdict.json`, replay, PDF, and quote verification. Use `npm run smoke` only if testing paid Anthropic API mode with a configured key.
6. Open a PR to the ScaleSync repository with the upstream commit range, decisions made during conflict resolution, tests, and any remaining risks. Do not silently push an unverified merge to `main`.

If upstream changed the council file format, update the watcher and PDF renderer with compatible parsing so existing sessions still replay. If upstream changed the skill or advisor format, keep the local runner prompt pointed at the updated skill and run the quote checker. Preserve user data in ignored `sessions/` and local `.env` during updates.
