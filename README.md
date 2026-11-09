# Pull request review list

A personal, locally run GitHub PR queue. Track the PRs you choose and highlight new activity since you last marked each PR as seen.

## Run locally

Use Node.js 24 (see `.nvmrc`), then:

```bash
npm ci
cp .env.example .env.local
# Edit .env.local with your GitHub token and discovery defaults.
npm run dev
```

Open http://localhost:3000. You can also enter a token in **Settings** and choose **Save token for auto-refresh**. When no environment token is configured, the server validates and keeps that token in memory until restart. After a restart, open the frontend and save it again. Your identity comes from the authenticated GitHub account, so PRs are automatically separated into **My PRs** and **Others’ PRs**.

`GITHUB_PAT` is read on the server. Existing `NEXT_PUBLIC_PAT`, `NEXT_PUBLIC_USERS`, `NEXT_PUBLIC_GROUPS`, and `NEXT_PUBLIC_ORGANIZATION` configurations still work as server-side fallbacks. Prefer the new names; tokens are never returned by the configuration endpoint or stored in the tracking JSON.

The token needs access to the repositories you track. Team discovery also needs access to the organization’s teams (classic tokens commonly use `repo` and `read:org`, with organization SSO authorization when required).

## Workflow

- **My View:** paste a Slack message or other text containing PR URLs. Multiple links, Slack-formatted links, `/files` links, and duplicates are handled. New additions start unseen.
- **Discover:** search open PRs by author usernames and/or teams requested for review. Choose **Add to My View** on the PRs you want to track. The existing involvement filter remains available.
- **Refresh:** retrieve current GitHub activity manually. A spinner indicates the update is running. Opening the app loads the saved list.
- **Auto-refresh:** the running server refreshes tracked PRs every 10 minutes, beginning 10 minutes after server startup. It uses the configured environment token or a token saved through Settings. It keeps running with the page closed. Long-running automatic refreshes skip overlapping scheduled ticks; failures retry at the next scheduled tick. Run one server per data directory.
- **OS notifications:** choose **Enable OS notifications** in Settings and allow the browser permission. While the page stays open (including in a background tab), it synchronizes saved results about every 15 seconds and updates the cards automatically. Each refresh that finds relevant new activity produces one generic notification: “GitHub PRs: News from your PRs.” Manual refreshes use the same notification rules. Existing unseen activity, additions, errors, and reopening the page do not trigger notifications. Notifications focus the app when clicked and leave PRs unseen. Browser locks and local storage prevent duplicate notifications across tabs when available; browsers that restrict these features use best-effort delivery. Notifications require browser support and a secure context, such as localhost or HTTPS; browser suspension can delay synchronization.
- **Unseen changes:** one badge signals activity. Clicking the PR opens GitHub in a new tab without clearing the badge.
- **Review indicators:** every card in My View shows active human approvals (check icon) and human comments (speech bubble). Counts reflect the last successful retrieval. Zero counts are muted; a dash means the PR needs a successful refresh to populate the indicators. Hover or focus an indicator for its explanation. Approvals count distinct reviewers with a current approval, excluding dismissed approvals and approvals superseded by requests for changes; they do not check required reviewers, teams, or merge readiness. Comments count discussion comments, inline comments/replies (including resolved threads), and published review summaries with text, deduplicated by ID. Empty approvals and unpublished drafts do not add comments. Both counts exclude the PR author, unidentified authors, and bots.
- **Mark as seen:** acknowledges only activity already retrieved and displayed. A subsequent comment or change appears after the next refresh. Stale browser acknowledgments cannot clear a newer retrieved event.
- **Remove:** requires confirmation. Closed and merged PRs remain tracked until you remove them.

My PRs flag new general comments, inline review comments, and review summaries with text from other people. Others’ PRs additionally flag head commit changes, replies posted after you joined a review thread, and resolution of threads you participated in by others. General comments from others also flag activity, to avoid missing answers outside a review thread. Your own comments and thread resolutions do not flag activity.

Both sections flag new approvals from other people, including approvals without comments and repeat approvals. Your own approvals do not flag activity. For PRs saved before approval tracking was introduced, the first successful refresh establishes the approval baseline without flagging existing approvals; later approvals trigger activity as usual.

Both sections also flag Draft → Open and transitions to Closed or Merged. Open → Draft and Closed → Open are ignored. Changes are compared between retrievals; an event that occurs and reverses entirely between refreshes may not be observed.

Bot filtering applies only to review indicators; unseen activity and notifications keep their existing behavior. The server requests each author's GraphQL `__typename` and counts only `User` accounts, automatically excluding `Bot` accounts. For automation using ordinary user accounts, set `GITHUB_BOT_USERS=automation-user,another-account` in `.env.local` (local development) or `.env` (Docker). Use GitHub usernames, not display names; matching ignores case and surrounding spaces. Restart the server after changing configuration and refresh the PRs to recalculate counts. No comment-text or username-pattern guessing is used.

## Local storage

State is saved atomically in `data/tracked-prs.json`, ignored by Git. It includes the tracked list, last successful retrieval per PR, conversation identifiers, acknowledgment revisions, and the latest refresh activity revision used for notifications. Comment bodies and tokens are not stored. Refresh failures retain saved activity and show an error on the affected card.

Set `PR_DATA_DIR` to change the storage directory. Run one app server per data directory; writes within that server are serialized. The list belongs to the first authenticated account used to add PRs. Switching accounts with a nonempty list is rejected so activity stays associated with the right person.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

Tests cover link extraction, pagination, comment and commit detection, thread resolution, status transitions, acknowledgment races, failed retrievals, duplicate additions, and JSON persistence.

## Docker

Put configuration in `.env`, then run:

```bash
docker compose up --build -d
```

Production runs at http://localhost:3100. The `pr-data` named volume preserves the JSON across container restarts and rebuilds. Environment files and personal data are excluded from the image.

For development with hot reloading:

```bash
docker compose --profile dev up --build githubprs-dev
```

Development runs at http://localhost:3001 and uses the repository’s local `data` directory.

## Server logs

Every API call writes structured JSON to stdout/stderr: request ID, method, path, browser-facing host, action when available, status, and duration. Errors include their message and stack trace. Individual PR retrieval failures and partial discovery failures are logged even when the overall request succeeds. Tokens and pasted message bodies are excluded; known token formats and configured credentials are redacted from error details.

Responses include `X-Request-ID` so you can match a browser request to the logs. With Docker:

```bash
docker compose logs -f githubprs
```

Origin validation uses the incoming Host header, allowing the public Docker port (3100) to differ from the container port (3000), while rejecting requests from other origins.
