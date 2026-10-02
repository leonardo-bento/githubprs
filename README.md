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

Open http://localhost:3000. You can also enter a token in **Settings** for the current browser session. Your identity comes from the authenticated GitHub account, so PRs are automatically separated into **My PRs** and **Others’ PRs**.

`GITHUB_PAT` is read on the server. Existing `NEXT_PUBLIC_PAT`, `NEXT_PUBLIC_USERS`, `NEXT_PUBLIC_GROUPS`, and `NEXT_PUBLIC_ORGANIZATION` configurations still work as server-side fallbacks. Prefer the new names; tokens are never returned by the configuration endpoint or stored in the tracking JSON.

The token needs access to the repositories you track. Team discovery also needs access to the organization’s teams (classic tokens commonly use `repo` and `read:org`, with organization SSO authorization when required).

## Workflow

- **My View:** paste a Slack message or other text containing PR URLs. Multiple links, Slack-formatted links, `/files` links, and duplicates are handled. New additions start unseen.
- **Discover:** search open PRs by author usernames and/or teams requested for review. Choose **Add to My View** on the PRs you want to track. The existing involvement filter remains available.
- **Refresh:** retrieve current GitHub activity manually. A spinner indicates the update is running. Opening the app only loads the saved list; it does not refresh GitHub.
- **Unseen changes:** one badge signals activity. Clicking the PR opens GitHub in a new tab without clearing the badge.
- **Mark as seen:** acknowledges only activity already retrieved and displayed. A subsequent comment or change appears after the next refresh. Stale browser acknowledgments cannot clear a newer retrieved event.
- **Remove:** requires confirmation. Closed and merged PRs remain tracked until you remove them.

My PRs flag new general comments, inline review comments, and review summaries with text from other people. Others’ PRs additionally flag head commit changes, replies posted after you joined a review thread, and resolution of threads you participated in by others. General comments from others also flag activity, to avoid missing answers outside a review thread. Your own comments and thread resolutions do not flag activity.

Both sections flag Draft → Open and transitions to Closed or Merged. Open → Draft and Closed → Open are ignored. Empty approvals are not comments. Changes are compared between manual retrievals; an event that occurs and reverses entirely between refreshes may not be observed.

## Local storage

State is saved atomically in `data/tracked-prs.json`, ignored by Git. It includes the tracked list, last successful retrieval per PR, conversation identifiers, and acknowledgment revisions. Comment bodies and tokens are not stored. Refresh failures retain saved activity and show an error on the affected card.

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
