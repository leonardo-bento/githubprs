export type PRStatus = 'Draft' | 'Open' | 'Closed' | 'Merged';
export interface CommentSnapshot {
  id: string;
  author: string;
  createdAt: string;
}
export interface ThreadSnapshot {
  id: string;
  resolved: boolean;
  resolvedBy: string;
  comments: CommentSnapshot[];
}
export interface PRSnapshot {
  involved?: boolean;
  title: string;
  author: string;
  status: PRStatus;
  headSha: string;
  comments: CommentSnapshot[];
  threads: ThreadSnapshot[];
  retrievedAt: string;
}
export interface PRReference {
  key: string;
  owner: string;
  repo: string;
  number: number;
  url: string;
}
export interface TrackedPR extends PRReference {
  snapshot: PRSnapshot;
  revision: number;
  seenRevision: number;
  addedAt: string;
  error?: string;
}
export interface TrackedCard extends PRReference {
  involved?: boolean;
  title: string;
  author: string;
  status: PRStatus;
  retrievedAt: string;
  revision: number;
  unseen: boolean;
  error?: string;
}

export function extractPRs(text: string): PRReference[] {
  const found = new Map<string, PRReference>();
  // Handles Slack <url|label>, Markdown, punctuation, query strings and /files links.
  const pattern = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)(?=$|[\s/?#>|)\]},.:;!])/gi;
  for (const match of text.matchAll(pattern)) {
    const [, owner, repo, value] = match;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) continue;
    const key = `${owner}/${repo}/${number}`.toLowerCase();
    found.set(key, { key, owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` });
  }
  return [...found.values()];
}

const sameUser = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function newCommentsFromOthers(before: CommentSnapshot[], after: CommentSnapshot[], viewer: string) {
  const ids = new Set(before.map((comment) => comment.id));
  return after.some((comment) => !ids.has(comment.id) && !sameUser(comment.author, viewer));
}

export function hasRelevantChanges(before: PRSnapshot, after: PRSnapshot, viewer: string): boolean {
  if (before.status !== after.status && (after.status === 'Closed' || after.status === 'Merged'
    || (before.status === 'Draft' && after.status === 'Open'))) return true;
  if (newCommentsFromOthers(before.comments, after.comments, viewer)) return true;
  const mine = sameUser(after.author, viewer);
  if (!mine && before.headSha !== after.headSha) return true;
  const oldThreads = new Map(before.threads.map((thread) => [thread.id, thread]));
  for (const thread of after.threads) {
    const old = oldThreads.get(thread.id);
    if (mine) {
      if (newCommentsFromOthers(old?.comments ?? [], thread.comments, viewer)) return true;
      continue;
    }
    const joinedIndex = thread.comments.findIndex((comment) => sameUser(comment.author, viewer));
    if (joinedIndex === -1) continue;
    // Thread comments are chronological; ordering also handles replies in the same second.
    if (newCommentsFromOthers(old?.comments ?? [], thread.comments.slice(joinedIndex + 1), viewer)) return true;
    if (old && !old.resolved && thread.resolved && !sameUser(thread.resolvedBy, viewer)) return true;
  }
  return false;
}

export function applySnapshot(pr: TrackedPR, snapshot: PRSnapshot, viewer: string): TrackedPR {
  return { ...pr, snapshot, revision: pr.revision + (hasRelevantChanges(pr.snapshot, snapshot, viewer) ? 1 : 0), error: undefined };
}

export function acknowledge(pr: TrackedPR, revision: number): TrackedPR {
  // A stale browser can acknowledge only the revision it actually displayed.
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > pr.revision) throw new Error('Invalid activity revision. Refresh the list and try again.');
  return { ...pr, seenRevision: Math.max(pr.seenRevision, revision) };
}

export function toCard(pr: TrackedPR): TrackedCard {
  const { snapshot, seenRevision, addedAt: _addedAt, ...rest } = pr;
  return { ...rest, title: snapshot.title, author: snapshot.author, status: snapshot.status,
    involved: snapshot.involved, retrievedAt: snapshot.retrievedAt, unseen: pr.revision > seenRevision };
}
