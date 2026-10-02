import type { CommentSnapshot, PRReference, PRSnapshot, ThreadSnapshot } from './tracking';

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type Connection<T> = { nodes: T[]; pageInfo: PageInfo };
type Comment = { id: string; author: { login: string } | null; createdAt: string };
type Review = Comment & { body: string; state: string };
type Thread = { id: string; isResolved: boolean; resolvedBy: { login: string } | null; comments: Connection<Comment> };
type Pull = {
  viewerLatestReviewRequest: { id: string } | null; title: string; author: { login: string } | null; state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean; headRefOid: string; comments: Connection<Comment>; reviews: Connection<Review>; reviewThreads: Connection<Thread>;
};
const pageInfo = 'pageInfo { hasNextPage endCursor }';
const commentFields = 'id author { login } createdAt';
const threadFields = `id isResolved resolvedBy { login } comments(first: 100) { nodes { ${commentFields} } ${pageInfo} }`;

async function graphql<T>(pat: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json() as { data?: T; message?: string; errors?: { message: string }[] };
  if (!response.ok || result.errors?.length || !result.data) {
    throw new Error(result.errors?.map((error) => error.message).join('; ') || result.message || `GitHub request failed (${response.status}).`);
  }
  return result.data;
}

async function allComments(pat: string, nodeId: string, kind: 'PullRequest' | 'PullRequestReviewThread', first: Connection<Comment>): Promise<CommentSnapshot[]> {
  const comments = [...first.nodes];
  let page = first.pageInfo;
  while (page.hasNextPage) {
    const result = await graphql<{ node: { comments: Connection<Comment> } | null }>(pat,
      `query($id: ID!, $cursor: String) { node(id: $id) { ... on ${kind} { comments(first: 100, after: $cursor) { nodes { ${commentFields} } ${pageInfo} } } } }`,
      { id: nodeId, cursor: page.endCursor });
    if (!result.node) throw new Error('GitHub conversation is no longer accessible. Refresh again.');
    comments.push(...result.node.comments.nodes);
    page = result.node.comments.pageInfo;
  }
  return comments.map((comment) => ({ id: comment.id, author: comment.author?.login ?? '', createdAt: comment.createdAt }));
}

export async function fetchSnapshot(reference: PRReference, pat: string): Promise<PRSnapshot> {
  const result = await graphql<{ viewer: { login: string }; repository: { pullRequest: (Pull & { id: string }) | null } | null }>(pat,
    `query($owner: String!, $repo: String!, $number: Int!) {
      viewer { login }
      repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
        id title author { login } state isDraft headRefOid
        viewerLatestReviewRequest { id }
        comments(first: 100) { nodes { ${commentFields} } ${pageInfo} }
        reviews(first: 100) { nodes { ${commentFields} body state } ${pageInfo} }
        reviewThreads(first: 100) { nodes { ${threadFields} } ${pageInfo} }
      } }
    }`, { owner: reference.owner, repo: reference.repo, number: reference.number });
  const pull = result.repository?.pullRequest;
  if (!pull) throw new Error('Pull request not found or your token cannot access it.');
  const threads = [...pull.reviewThreads.nodes];
  let page = pull.reviewThreads.pageInfo;
  while (page.hasNextPage) {
    const next = await graphql<{ node: { reviewThreads: Connection<Thread> } | null }>(pat,
      `query($id: ID!, $cursor: String) { node(id: $id) { ... on PullRequest { reviewThreads(first: 100, after: $cursor) { nodes { ${threadFields} } ${pageInfo} } } } }`,
      { id: pull.id, cursor: page.endCursor });
    if (!next.node) throw new Error('Pull request is no longer accessible. Refresh again.');
    threads.push(...next.node.reviewThreads.nodes);
    page = next.node.reviewThreads.pageInfo;
  }
  const comments = await allComments(pat, pull.id, 'PullRequest', pull.comments);
  const reviews = [...pull.reviews.nodes];
  let reviewPage = pull.reviews.pageInfo;
  while (reviewPage.hasNextPage) {
    const next = await graphql<{ node: { reviews: Connection<Review> } | null }>(pat,
      `query($id: ID!, $cursor: String) { node(id: $id) { ... on PullRequest { reviews(first: 100, after: $cursor) { nodes { ${commentFields} body state } ${pageInfo} } } } }`,
      { id: pull.id, cursor: reviewPage.endCursor });
    if (!next.node) throw new Error('Pull request reviews are no longer accessible. Refresh again.');
    reviews.push(...next.node.reviews.nodes);
    reviewPage = next.node.reviews.pageInfo;
  }
  // Review summaries with text are comments too; empty approvals and unpublished drafts are not.
  comments.push(...reviews.filter((review) => review.state !== 'PENDING' && review.body.trim()).map((review) => ({
    id: review.id, author: review.author?.login ?? '', createdAt: review.createdAt,
  })));
  const snapshots: ThreadSnapshot[] = [];
  // Sequential requests keep large conversations from exhausting GitHub's concurrency allowance.
  for (const thread of threads) {
    snapshots.push({ id: thread.id, resolved: thread.isResolved, resolvedBy: thread.resolvedBy?.login ?? '',
      comments: await allComments(pat, thread.id, 'PullRequestReviewThread', thread.comments) });
  }
  const isViewer = (login: string) => login.toLowerCase() === result.viewer.login.toLowerCase();
  const involved = Boolean(pull.viewerLatestReviewRequest)
    || isViewer(pull.author?.login ?? '')
    || comments.some((comment) => isViewer(comment.author))
    || reviews.some((review) => review.state !== 'PENDING' && isViewer(review.author?.login ?? ''))
    || snapshots.some((thread) => thread.comments.some((comment) => isViewer(comment.author)));
  return { involved, title: pull.title, author: pull.author?.login ?? '',
    status: pull.state === 'MERGED' ? 'Merged' : pull.state === 'CLOSED' ? 'Closed' : pull.isDraft ? 'Draft' : 'Open',
    headSha: pull.headRefOid, comments, threads: snapshots, retrievedAt: new Date().toISOString() };
}

export async function fetchViewer(pat: string): Promise<string> {
  const result = await graphql<{ viewer: { login: string } }>(pat, 'query { viewer { login } }', {});
  return result.viewer.login;
}
