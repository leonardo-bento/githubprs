import type { CommentSnapshot, PRReference, PRSnapshot, ThreadSnapshot } from './tracking';

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type Connection<T> = { nodes: T[]; pageInfo: PageInfo };
type Comment = { id: string; author: { login: string; __typename?: string } | null; createdAt: string;
  pullRequestReview?: { state: string } | null };
type ReviewVerdict = Comment & { state: string };
type Review = ReviewVerdict & { body: string };
type Thread = { id: string; isResolved: boolean; resolvedBy: { login: string } | null; comments: Connection<Comment> };
type Pull = {
  viewerLatestReviewRequest: { id: string } | null; title: string; author: { login: string } | null; state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean; headRefOid: string; comments: Connection<Comment>; reviews: Connection<Review>;
  latestOpinionatedReviews: Connection<ReviewVerdict>; reviewThreads: Connection<Thread>;
};
const pageInfo = 'pageInfo { hasNextPage endCursor }';
const commentFields = 'id author { login __typename } createdAt';
const threadCommentFields = `${commentFields} pullRequestReview { state }`;
const threadFields = `id isResolved resolvedBy { login } comments(first: 100) { nodes { ${threadCommentFields} } ${pageInfo} }`;

function commentSnapshot(comment: Comment): CommentSnapshot {
  return { id: comment.id, author: comment.author?.login ?? '', createdAt: comment.createdAt,
    ...(comment.author?.__typename ? { authorType: comment.author.__typename } : {}),
    ...(comment.pullRequestReview?.state === 'PENDING' ? { published: false } : {}) };
}

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
      `query($id: ID!, $cursor: String) { node(id: $id) { ... on ${kind} { comments(first: 100, after: $cursor) { nodes { ${kind === 'PullRequest' ? commentFields : threadCommentFields} } ${pageInfo} } } } }`,
      { id: nodeId, cursor: page.endCursor });
    if (!result.node) throw new Error('GitHub conversation is no longer accessible. Refresh again.');
    comments.push(...result.node.comments.nodes);
    page = result.node.comments.pageInfo;
  }
  return comments.map(commentSnapshot);
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
        latestOpinionatedReviews(first: 100) { nodes { ${commentFields} state } ${pageInfo} }
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
  comments.push(...reviews.filter((review) => review.state !== 'PENDING' && review.body.trim()).map(commentSnapshot));
  const approvals = reviews.filter((review) => review.state === 'APPROVED').map((review) => ({
    id: review.id, author: review.author?.login ?? '', createdAt: review.createdAt,
  }));
  // Keep current verdicts separate from historical records used by unseen activity.
  const currentReviews = [...pull.latestOpinionatedReviews.nodes];
  let currentReviewPage = pull.latestOpinionatedReviews.pageInfo;
  while (currentReviewPage.hasNextPage) {
    const next = await graphql<{ node: { latestOpinionatedReviews: Connection<ReviewVerdict> } | null }>(pat,
      `query($id: ID!, $cursor: String) { node(id: $id) { ... on PullRequest { latestOpinionatedReviews(first: 100, after: $cursor) { nodes { ${commentFields} state } ${pageInfo} } } } }`,
      { id: pull.id, cursor: currentReviewPage.endCursor });
    if (!next.node) throw new Error('Pull request reviews are no longer accessible. Refresh again.');
    currentReviews.push(...next.node.latestOpinionatedReviews.nodes);
    currentReviewPage = next.node.latestOpinionatedReviews.pageInfo;
  }
  const snapshots: ThreadSnapshot[] = [];
  // Sequential requests keep large conversations from exhausting GitHub's concurrency allowance.
  for (const thread of threads) {
    snapshots.push({ id: thread.id, resolved: thread.isResolved, resolvedBy: thread.resolvedBy?.login ?? '',
      comments: await allComments(pat, thread.id, 'PullRequestReviewThread', thread.comments) });
  }
  const botUsers = new Set((process.env.GITHUB_BOT_USERS ?? '').split(',').map((login) => login.trim().toLowerCase()).filter(Boolean));
  const eligible = (comment: CommentSnapshot) => comment.authorType === 'User' && Boolean(comment.author)
    && comment.author.toLowerCase() !== (pull.author?.login ?? '').toLowerCase()
    && !botUsers.has(comment.author.toLowerCase());
  const humanComments = [...comments, ...snapshots.flatMap((thread) => thread.comments)]
    .filter((comment) => comment.published !== false && eligible(comment));
  const reviewSignals = {
    commentCount: new Set(humanComments.map((comment) => comment.id)).size,
    approvalCount: new Set(currentReviews.filter((review) => review.state === 'APPROVED' && eligible(commentSnapshot(review)))
      .map((review) => review.author!.login.toLowerCase())).size,
  };
  const isViewer = (login: string) => login.toLowerCase() === result.viewer.login.toLowerCase();
  const involved = Boolean(pull.viewerLatestReviewRequest)
    || isViewer(pull.author?.login ?? '')
    || comments.some((comment) => isViewer(comment.author))
    || reviews.some((review) => review.state !== 'PENDING' && isViewer(review.author?.login ?? ''))
    || snapshots.some((thread) => thread.comments.some((comment) => isViewer(comment.author)));
  return { involved, reviewSignals, title: pull.title, author: pull.author?.login ?? '',
    status: pull.state === 'MERGED' ? 'Merged' : pull.state === 'CLOSED' ? 'Closed' : pull.isDraft ? 'Draft' : 'Open',
    headSha: pull.headRefOid, comments, approvals, threads: snapshots, retrievedAt: new Date().toISOString() };
}

export async function fetchViewer(pat: string): Promise<string> {
  const result = await graphql<{ viewer: { login: string } }>(pat, 'query { viewer { login } }', {});
  return result.viewer.login;
}
