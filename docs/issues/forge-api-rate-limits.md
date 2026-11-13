# Too many GitHub / GitLab API calls (rate limit)

**Status:** fixed on 2026-11-13 (ideas 1, 2, 3, 4, 6 and 7). Idea 5 (GraphQL) was left out; see the end.
**Found:** 2026-11-13, on `feat/ui-improvements`, right after the source control panel landed (commits `3d84948`, `5bc43e5`).

## What happened

The source control panel showed:

> **Could not reach GitHub**
> GitHub's API rate limit was reached. It resets at 11:50:03.

The limits involved: GitHub allows 5,000 requests an hour with a token (60 without one). GitLab.com and self-hosted instances have their own per-user limits.

## Where the calls came from

| Caller (web) | RPC | API calls each time | How often |
|---|---|---|---|
| `SourceControlButton` (always in the session header) | `PullRequests.publication` | 1 (find the branch's PR/MR) | Every time a session page opens |
| `SessionPanel` | `PullRequests.publication` | 1 | **On every tool call or approval** while the panel is open (`activity` changes), plus the Refresh button and every commit or push |
| `PullRequestTab` | `PullRequests.details` | GitHub: 6 (find, check-runs, status, issue comments, review comments, reviews). GitLab: 4 (find, pipelines, jobs, notes). Each comment list also costs one call per extra page. | **Every 30 s** while the tab is open: ~720 GitHub calls an hour per open tab |

Each browser tab polls on its own, and the daemon caches nothing, so two tabs on the same session double the calls.

## Ideas for the fix

1. **Split `publication`.** The local part (branch, upstream, ahead/behind, uncommitted files, which host) comes from git alone and is instant. Only the PR lookup needs the API. The header button and the refresh after each tool call should use only the local part. This also fixes the slow GitLab logo in the header.
2. **Cache in the daemon.** Keep PR, checks and comments per `(repo, branch)` for a short time (e.g. 30–60 s), and share the cache across browser tabs and sessions on the same branch. Clear the cache after our own push or PR creation.
3. **Conditional requests.** Send `If-None-Match` with the ETag of the last answer. On GitHub, a `304 Not Modified` doesn't count against the rate limit. GitLab supports ETags on some endpoints.
4. **Poll smarter.**
   - Only while the window is visible (`document.visibilityState`).
   - Slow down when nothing has changed.
   - Stop polling checks once they've all finished, and stop entirely for merged or closed PRs.
   - Poll comments less often than checks.
5. **Fewer requests per refresh.** GitHub GraphQL can return the PR, its checks and its comments in one query. It has its own points-based limit, so check what that query costs.
6. **Watch the budget.** Read `x-ratelimit-remaining` / `ratelimit-remaining` from each response. Back off when they get low, and show it in the UI instead of failing outright.
7. **Don't call the API without a token.** With no token, GitHub allows only 60 calls an hour, so ask the human to connect a token instead of polling.

Start with 1 and 2. They remove most of the calls without changing what the panel shows.

## What was done

- **`PullRequests.publication` reads git only.** The header button and the refresh after each tool call no longer reach the forge.
- **`ForgeSync` (daemon) follows pull requests.** One poller per `(host, repo, branch)`, shared by every tab and session on that branch. It runs only while someone watches and keeps the last answer, so a returning watcher is served without a request. The web app subscribes to `PullRequests.watch` and stops watching while the page is hidden.
- **Pace.** Every 60 s for an open pull request or a branch without one, every 15 min for a closed one, never for a merged one whose checks finished. It asks again 5 s after a push or a new pull request, then once more after 15 s for the checks that start.
- **`ForgeGate` in front of every request.** Pull request reads send `If-None-Match`; GitHub does not count a `304`. The gate keeps the quota from the response headers, holds the last tenth for requests the human starts, stays away after a rate limit until it resets, and allows 8 requests at once.
- **No token, no polling.** The forge is asked only on Refresh, and the panel says to connect a token.
- **A rate limit is a pause, not an error.** The panel keeps showing the last answer with "Paused until HH:MM".

An unchanged open pull request now costs GitHub nothing per poll, against about 720 calls an hour per tab before.

## Left out

- **GraphQL.** With ETags the REST cost is already near zero when nothing changes. T3 Code uses GraphQL and still needs REST ETag probes in front of it.
- **GitLab counts a `304`.** GitLab answers conditional requests, which saves the transfer, but its rate limit still counts them. Its limits are far looser than GitHub's, and the 60 s pace costs about 4 requests a minute per watched branch.
- **Idle detection.** A visible page with nobody at the keyboard keeps its watch. T3 Code stops after 6 minutes without input; add that if GitLab limits ever bite.
