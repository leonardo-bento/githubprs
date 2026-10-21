const deliveryKey = 'githubprs:last-notified-activity';

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export class ActivityNotifications {
  private revision: number | null = null;

  async observe(revision: number) {
    const previous = this.revision;
    this.revision = Math.max(previous ?? 0, revision);
    // Opening a page establishes a baseline, without announcing saved activity.
    if (previous !== null && revision > previous) await notifyActivity(revision);
  }
}

export async function notifyActivity(revision: number) {
  if (notificationPermission() !== 'granted') return;
  const deliver = () => {
    try {
      if (Number(localStorage.getItem(deliveryKey)) >= revision) return;
    } catch { /* Notifications still work when browser storage is disabled. */ }
    const notification = new Notification('GitHub PRs: News from your PRs.', {
      tag: `githubprs-activity-${revision}`,
    });
    notification.onclick = () => { window.focus(); notification.close(); };
    try { localStorage.setItem(deliveryKey, String(revision)); } catch { /* Best effort across tabs. */ }
  };
  // The lock makes the storage check and delivery atomic across browser tabs.
  if (navigator.locks) await navigator.locks.request('githubprs-notification', deliver);
  else deliver();
}
