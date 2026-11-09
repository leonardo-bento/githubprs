import type { ReviewSignals } from '@/lib/tracking';

export default function ReviewIndicators({ signals }: { signals?: ReviewSignals }) {
  const indicators = [
    { kind: 'approvals', count: signals?.approvalCount, label: 'Active human approvals',
      explanation: 'One per reviewer; excludes bots and the PR author. Required reviewers are not checked.' },
    { kind: 'comments', count: signals?.commentCount, label: 'Human comments',
      explanation: 'Discussion, inline comments, and written reviews; excludes bots and the PR author.' },
  ];
  return <span className="review-indicators">
    {indicators.map(({ kind, count, label, explanation }) => {
      const description = count === undefined ? `${label}: refresh to retrieve counts.` : `${label}: ${count}. ${explanation}`;
      return <span key={kind} className={`review-indicator${count ? ` review-indicator-${kind}` : ''}`}
        role="img" tabIndex={0} aria-label={description}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {kind === 'approvals' ? <path d="m5 12 4 4L19 6" /> : <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />}
        </svg>
        <span aria-hidden="true">{count ?? '—'}</span>
        <span className="review-tooltip" aria-hidden="true">{description}</span>
      </span>;
    })}
  </span>;
}
