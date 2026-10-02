'use client';

import { useState } from 'react';
import type { ListedPullRequest } from '@/services/github';
import InputField from './InputField';
import DateField from './DateField';
import PullRequestsList from './PullRequestsList';

export interface DiscoverySettings { organization: string; users: string; groups: string }
interface Props {
  settings: DiscoverySettings;
  token: string;
  trackedUrls: Set<string>;
  busy: boolean;
  onAdd: (text: string) => Promise<void>;
}

export default function Discover({ settings, token, trackedUrls, busy, onAdd }: Props) {
  const [organization, setOrganization] = useState(settings.organization);
  const [users, setUsers] = useState(settings.users);
  const [groups, setGroups] = useState(settings.groups);
  const [date, setDate] = useState(() => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [pullRequests, setPullRequests] = useState<ListedPullRequest[]>([]);
  const [onlyInvolved, setOnlyInvolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function search() {
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/discover', { method: 'POST', headers: {
        'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: JSON.stringify({ organization, users, groups, date }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPullRequests(data.pullRequests);
      setMessage(data.teamSearchWarning || (data.pullRequests.length ? '' : 'No open PRs match this search. Try an earlier date.'));
    } catch (error) { setError(error instanceof Error ? error.message : 'Search failed. Try again.'); }
    finally { setLoading(false); }
  }

  return <section aria-labelledby="discover-heading">
    <h2 id="discover-heading">Discover PRs</h2>
    <p className="muted">Find your team’s open PRs, then choose which ones to track.</p>
    <div className="discovery-fields">
      <InputField id="organization" label="Organization" value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="e.g., your-org" required />
      <InputField id="users" label="Usernames, comma-separated" value={users} onChange={(event) => setUsers(event.target.value)} placeholder="e.g., octocat, teammate" />
      <InputField id="groups" label="Team slugs, comma-separated" value={groups} onChange={(event) => setGroups(event.target.value)} placeholder="e.g., engineering, org/security" description="Matches teams requested for review." />
      <DateField id="date" label="PRs created after" value={date} onChange={(event) => setDate(event.target.value)} max={new Date().toISOString().split('T')[0]} />
    </div>
    <button className="button button-primary" onClick={search} disabled={loading || busy}>
      {loading && <span className="spinner" aria-hidden="true" />}{loading ? 'Searching…' : 'Search PRs'}
    </button>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {message && <p role="status" className="muted">{message}</p>}
    {pullRequests.length > 0 && <label className="involvement-filter"><input type="checkbox" checked={onlyInvolved} onChange={(event) => setOnlyInvolved(event.target.checked)} /> Show only PRs I’m involved in</label>}
    <PullRequestsList pullRequests={onlyInvolved ? pullRequests.filter((pr) => pr.involved) : pullRequests} onAdd={onAdd} trackedUrls={trackedUrls} busy={busy || loading} />
  </section>;
}
