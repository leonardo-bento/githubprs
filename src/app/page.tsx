'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Discover, { DiscoverySettings } from '@/components/Discover';
import InputField from '@/components/InputField';
import RemoveConfirmation from '@/components/RemoveConfirmation';
import ReviewIndicators from '@/components/ReviewIndicators';
import type { TrackedCard } from '@/lib/tracking';
import { ActivityNotifications, notificationPermission } from '@/lib/notifications';

interface ListResponse { viewer: string; pullRequests: TrackedCard[]; activityRevision: number; message?: string }
interface Config extends DiscoverySettings { hasToken: boolean }

export default function Home() {
  const [tab, setTab] = useState<'tracked' | 'discover'>('tracked');
  const [config, setConfig] = useState<Config | null>(null);
  const [token, setToken] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewer, setViewer] = useState('');
  const [pullRequests, setPullRequests] = useState<TrackedCard[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<TrackedCard | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [notifications] = useState(() => new ActivityNotifications());
  const mutating = useRef(false);
  const mutationVersion = useRef(0);

  const updateList = useCallback((data: ListResponse, feedback = true) => {
    void notifications.observe(data.activityRevision).catch(() => { /* OS notification failure must not interrupt list updates. */ });
    setPullRequests(data.pullRequests); setViewer(data.viewer);
    if (feedback) setMessage(data.message || '');
  }, [notifications]);

  useEffect(() => {
    setPermission(notificationPermission());
    let active = true;
    async function load() {
      try {
        const [configResponse, listResponse] = await Promise.all([fetch('/api/config'), fetch('/api/tracked')]);
        const [settings, list] = await Promise.all([configResponse.json(), listResponse.json()]);
        if (!active) return;
        if (configResponse.ok) { setConfig(settings); setSettingsOpen(!settings.hasToken); }
        if (!listResponse.ok) throw new Error(list.error);
        updateList(list);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : 'Could not load saved PRs. Reload to try again.'); }
      finally { if (active) setInitialLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [updateList]);

  useEffect(() => {
    if (initialLoading) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function sync() {
      const version = mutationVersion.current;
      try {
        if (!mutating.current) {
          const response = await fetch('/api/tracked', { cache: 'no-store' });
          const data = await response.json();
          if (active && response.ok && !mutating.current && version === mutationVersion.current) updateList(data, false);
        }
      } catch { /* Retry saved-state synchronization on the next poll. */ }
      finally { if (active) timer = setTimeout(() => void sync(), 15_000); }
    }
    timer = setTimeout(() => void sync(), 15_000);
    return () => { active = false; clearTimeout(timer); };
  }, [initialLoading, updateList]);

  async function act(action: string, fields: Record<string, unknown> = {}) {
    mutating.current = true; mutationVersion.current++;
    setBusy(action); setError(''); setMessage('');
    try {
      const response = await fetch('/api/tracked', { method: 'POST', headers: {
        'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: JSON.stringify({ action, ...fields }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      updateList(data);
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Request failed. Try again.'); return false; }
    finally { mutating.current = false; setBusy(''); }
  }

  async function saveToken() {
    setBusy('token'); setError(''); setMessage('');
    try {
      const response = await fetch('/api/config', { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      }, body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfig((current) => current && { ...current, hasToken: data.hasToken });
      setMessage(data.message);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save token.'); }
    finally { setBusy(''); }
  }

  async function enableNotifications() {
    try { setPermission(await Notification.requestPermission()); }
    catch { setError('Could not enable notifications. Check your browser notification settings.'); }
  }

  async function add(value: string) { await act('add', { text: value }); }
  const disabled = Boolean(busy) || initialLoading;
  const mine = pullRequests.filter((pr) => pr.author.toLowerCase() === viewer.toLowerCase());
  const others = pullRequests.filter((pr) => pr.author.toLowerCase() !== viewer.toLowerCase());
  const trackedUrls = new Set(pullRequests.map((pr) => pr.url.toLowerCase()));
  const unseenCount = pullRequests.filter((pr) => pr.unseen).length;

  function cards(title: string, items: TrackedCard[], empty: string) {
    return <section className="tracked-section" aria-label={title}>
      <h2>{title} <span className="count">{items.length}</span></h2>
      {items.length === 0 ? <p className="empty-state">{empty}</p> : <ul className="pr-list">
        {items.map((pr) => <li key={pr.key} className={`pr-row${pr.unseen ? ' pr-unseen' : ''}`}>
          <div className="pr-details">
            <a className="pr-title link" href={pr.url} target="_blank" rel="noopener noreferrer">{pr.title}
              {pr.unseen && <span className="activity-badge">Unseen changes</span>}
            </a>
            <div className="pr-meta"><span>{pr.owner}/{pr.repo} #{pr.number}</span><span>by {pr.author || 'deleted user'}</span>{pr.involved && pr.author.toLowerCase() !== viewer.toLowerCase() && <span className="status-badge involved-badge">Involved</span>}<span className={`pr-status pr-status-${pr.status.toLowerCase()}`}>{pr.status}</span></div>
            <ReviewIndicators signals={pr.reviewSignals} />
            <p className="retrieval-time">Last retrieved <time dateTime={pr.retrievedAt}>{new Date(pr.retrievedAt).toLocaleString()}</time></p>
            {pr.error && <p role="alert" className="pr-error">Could not refresh: {pr.error}</p>}
          </div>
          <div className="pr-actions">
            <button className="button button-secondary" disabled={disabled || !pr.unseen} onClick={() => void act('seen', { key: pr.key, revision: pr.revision })}>{pr.unseen ? 'Mark as seen' : 'Seen'}</button>
            <button className="button remove-button" disabled={disabled} onClick={() => setRemoving(pr)} aria-label={`Remove ${pr.title}`}>Remove</button>
          </div>
        </li>)}
      </ul>}
    </section>;
  }

  return <main className="workspace">
    <header className="workspace-header"><div><h1>Pull request review list</h1><p className="muted">Keep the PRs you’re ready to follow.</p></div>{viewer && <span className="viewer">Signed in as {viewer}</span>}</header>
    <details className="settings" open={settingsOpen} onToggle={(event) => setSettingsOpen(event.currentTarget.open)}>
      <summary>Settings</summary>
      <div className="settings-content"><InputField id="token" label="GitHub personal access token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={config?.hasToken ? 'Using configured token; enter to override' : 'Enter your token'} description="Save a token to enable automatic refresh until the server restarts. Your GitHub identity determines which PRs are yours." />
        <button className="button button-secondary" disabled={disabled || !token.trim()} onClick={() => void saveToken()}>{busy === 'token' ? 'Saving…' : 'Save token for auto-refresh'}</button>
        {config?.hasToken && <p className="muted">A token is configured on the local server.</p>}
        <p className="muted">{permission === 'granted' ? 'OS notifications are enabled while this page is open.' : permission === 'denied' ? 'Notifications are blocked. Allow them in your browser settings to receive PR updates.' : permission === 'unsupported' ? 'OS notifications are unavailable in this browser.' : 'Enable OS notifications to hear when your PRs have new activity.'}</p>
        {permission === 'default' && <button className="button button-secondary" onClick={() => void enableNotifications()}>Enable OS notifications</button>}
      </div>
    </details>
    <nav className="view-tabs" aria-label="PR views"><button className={tab === 'tracked' ? 'active' : ''} aria-current={tab === 'tracked' ? 'page' : undefined} onClick={() => setTab('tracked')}>My View <span className="count">{unseenCount}</span></button><button className={tab === 'discover' ? 'active' : ''} aria-current={tab === 'discover' ? 'page' : undefined} onClick={() => setTab('discover')}>Discover</button></nav>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {message && <p className="feedback" role="status">{message}</p>}
    {initialLoading && <p role="status" className="loading-message"><span className="spinner" aria-hidden="true" />Loading saved PRs…</p>}
    <div hidden={tab !== 'tracked'}>
      <div className="list-toolbar"><p className="muted">{pullRequests.length} tracked PR{pullRequests.length === 1 ? '' : 's'}. {config?.hasToken ? 'Auto-refreshes every 10 minutes.' : 'Save a token in Settings to enable auto-refresh.'}</p><button className="button button-primary" disabled={disabled || !pullRequests.length} onClick={() => void act('refresh')}>{busy === 'refresh' && <span className="spinner" aria-hidden="true" />}{busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button></div>
      <form className="paste-form" onSubmit={(event) => { event.preventDefault(); void add(text); }}>
        <label className="label" htmlFor="paste">Add PRs from Slack or any text</label><textarea id="paste" className="input" rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste a message containing GitHub pull request links…" />
        <button className="button button-secondary" disabled={disabled || !text.trim()} type="submit">{busy === 'add' && <span className="spinner" aria-hidden="true" />}{busy === 'add' ? 'Adding…' : 'Add to My View'}</button>
      </form>
      <div aria-busy={busy === 'refresh'}>{cards('My PRs', mine, 'PRs you opened will appear here when you add them.')}{cards('Others’ PRs', others, 'Paste PR links above or add PRs from Discover.')}</div>
    </div>
    {config && <div hidden={tab !== 'discover'}><Discover settings={config} token={token} trackedUrls={trackedUrls} busy={disabled} onAdd={add} /></div>}
    {busy && <p className="operation-status" role="status">{busy === 'refresh' ? 'Retrieving current activity from GitHub…' : busy === 'add' ? 'Retrieving PRs from GitHub…' : busy === 'token' ? 'Saving token…' : 'Saving your list…'}</p>}
    {removing && <RemoveConfirmation pr={removing} busy={disabled} onCancel={() => setRemoving(null)} onConfirm={async () => {
      if (await act('remove', { key: removing.key })) setRemoving(null);
    }} />}
  </main>;
}
