// GitHub API types
export interface GitHubUser {
  login: string;
  html_url: string;
}

export interface PullRequest {
  id: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: GitHubUser;
  state: 'open' | 'closed';
  created_at: string;
}

export type MatchSource = 'Person' | 'Group' | 'Person and Group';

export interface ListedPullRequest extends PullRequest {
  matchSource: MatchSource;
}

export interface GitHubSearchResponse {
  items: PullRequest[];
  total_count: number;
}

export interface PullRequestsWithMatchResult {
  pullRequests: ListedPullRequest[];
  /** Set when team/group search fails (e.g. 403); user-based results are still returned when present. */
  teamSearchWarning?: string;
}

const getHeaders = (pat: string) => {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github.v3+json',
  };
};

async function readGitHubErrorMessage(response: Response): Promise<string> {
  try {
    const body: {
      message?: string;
      errors?: Array<{ message?: string; code?: string }>;
    } = await response.json();
    let msg = '';
    if (body && typeof body.message === 'string') msg = body.message;
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      const parts = body.errors
        .map((e) => e.message || '')
        .filter(Boolean);
      if (parts.length) msg = msg ? `${msg} (${parts.join('; ')})` : parts.join('; ');
    }
    if (msg) return msg;
  } catch {
    /* ignore */
  }
  return response.statusText || 'Unknown error';
}

function validationHint(status: number): string {
  if (status !== 422) return '';
  return (
    ' GitHub often returns this when the org name is wrong, the query is too long, ' +
    'or your token cannot access that org (authorize SSO for the org on your PAT, or fix the org login).'
  );
}

const fetchAllSearchPages = async (query: string, pat: string): Promise<PullRequest[]> => {
  let allPulls: PullRequest[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const pullsUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`;
    const response = await fetch(pullsUrl, { headers: getHeaders(pat) });

    if (!response.ok) {
      const detail = await readGitHubErrorMessage(response);
      throw new Error(
        `GitHub search failed (${response.status}): ${detail}.${validationHint(response.status)}`
      );
    }

    const data: GitHubSearchResponse = await response.json();
    allPulls = allPulls.concat(data.items);
    hasNextPage = data.items.length === 100;
    page++;
  }

  return allPulls;
};

/** Like fetchAllSearchPages but returns an error instead of throwing (for optional team search). */
const tryFetchAllSearchPages = async (
  query: string,
  pat: string
): Promise<{ ok: true; items: PullRequest[] } | { ok: false; message: string }> => {
  try {
    const items = await fetchAllSearchPages(query, pat);
    return { ok: true, items };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
};

/** Trim, strip @, or take org from a pasted github.com/org URL. */
export function normalizeOrgLogin(value: string): string {
  let s = value.trim().replace(/^@/, '');
  const fromUrl = s.match(/github\.com\/([^/]+)\/?$/i);
  if (fromUrl) s = fromUrl[1];
  return s.trim();
}

function buildBaseQuery(organization: string, lastDateStr: string): string {
  return `is:pr state:open org:${organization} created:>${lastDateStr}`;
}

/** Slug is either a team slug under `organization` or a full `org/team` path. */
function teamReviewQualifier(slug: string, organization: string): string {
  const s = slug.trim();
  if (!s) return '';
  const path = s.includes('/') ? s : `${organization}/${s}`;
  return `team-review-requested:${path}`;
}

function mergeByMatchSource(
  byUser: Map<number, PullRequest>,
  byGroup: Map<number, PullRequest>
): ListedPullRequest[] {
  const ids = new Set<number>([...byUser.keys(), ...byGroup.keys()]);
  const merged: ListedPullRequest[] = [];

  for (const id of ids) {
    const fromUser = byUser.get(id);
    const fromGroup = byGroup.get(id);
    const pr = fromUser ?? fromGroup;
    if (!pr) continue;

    let matchSource: MatchSource;
    if (fromUser && fromGroup) matchSource = 'Person and Group';
    else if (fromUser) matchSource = 'Person';
    else matchSource = 'Group';

    merged.push({ ...pr, matchSource });
  }

  merged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return merged;
}

function stripAt(login: string): string {
  return login.trim().replace(/^@/, '');
}

/**
 * Fetches open PRs in the org created after `lastDate` that match either:
 * - authors in `memberUsernames` (one search per user — avoids OR limits and fragile OR syntax), and/or
 * - `team-review-requested` (one search per team — avoids chaining OR past GitHub's limit of five).
 *
 * If the team search fails (common when the token lacks `read:org` or org team visibility),
 * user results are still returned and `teamSearchWarning` explains the skip.
 */
export const getPullRequestsWithMatch = async (
  organization: string,
  memberUsernames: string[],
  groupSlugs: string[],
  pat: string,
  lastDate: Date
): Promise<PullRequestsWithMatchResult> => {
  const org = normalizeOrgLogin(organization);
  const lastDateStr = lastDate.toISOString().split('T')[0];
  const base = buildBaseQuery(org, lastDateStr);

  const byUser = new Map<number, PullRequest>();
  const byGroup = new Map<number, PullRequest>();

  const users = memberUsernames.map(stripAt).filter(Boolean);

  if (users.length > 0) {
    const userSearches = users.map((username) => {
      const userQuery = `${base} author:${username}`;
      return fetchAllSearchPages(userQuery, pat);
    });
    const userResultLists = await Promise.all(userSearches);
    for (const pulls of userResultLists) {
      for (const pr of pulls) byUser.set(pr.id, pr);
    }
  }

  let teamSearchWarning: string | undefined;
  const teams = groupSlugs.map((s) => s.trim()).filter(Boolean);

  if (teams.length > 0) {
    const outcomes = await Promise.all(
      teams.map((slug) => {
        const q = teamReviewQualifier(slug, org);
        if (!q) return Promise.resolve({ ok: true as const, items: [] as PullRequest[] });
        const groupQuery = `${base} ${q}`;
        return tryFetchAllSearchPages(groupQuery, pat);
      })
    );

    const failures: string[] = [];
    for (const outcome of outcomes) {
      if (outcome.ok) {
        for (const pr of outcome.items) byGroup.set(pr.id, pr);
      } else {
        failures.push(outcome.message);
      }
    }

    if (failures.length > 0) {
      teamSearchWarning =
        `Group search could not run for one or more teams (${failures[0]}). ` +
        `Showing user matches only when available. Team search usually needs read:org on the PAT and access to those teams.`;
    }
  }

  return {
    pullRequests: mergeByMatchSource(byUser, byGroup),
    teamSearchWarning,
  };
};
