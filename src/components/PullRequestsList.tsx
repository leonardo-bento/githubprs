import { PullRequest } from '../services/github';

interface PullRequestsListProps {
  pullRequests: PullRequest[];
}

export default function PullRequestsList({ pullRequests }: PullRequestsListProps) {
  if (pullRequests.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 'var(--spacing-8)' }}>
      <h2 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 'bold', 
        color: 'var(--foreground)', 
        marginBottom: 'var(--spacing-4)'
      }}>
        Open Pull Requests ({pullRequests.length})
      </h2>
      <div style={{ 
        overflowX: 'auto', 
        borderRadius: 'var(--radius-lg)'
      }}>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Repository</th>
              <th>Author</th>
              <th>State</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            {pullRequests.map((pr) => (
              <tr key={pr.id}>
                <td>
                  <a 
                    href={pr.html_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="link"
                    style={{ fontWeight: '500' }}
                  >
                    {pr.title}
                  </a>
                </td>
                <td>
                  <a 
                    href={pr.repository_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="link"
                  >
                    {pr.repository_url.split('/').pop()}
                  </a>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                    <a 
                      href={pr.user.html_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="link"
                      style={{ fontWeight: '500' }}
                    >
                      {pr.user.login}
                    </a>
                  </div>
                </td>
                <td>
                  <span className={`status-badge status-${pr.state}`}>
                    {pr.state}
                  </span>
                </td>
                <td>
                  <time 
                    dateTime={pr.created_at}
                    style={{ 
                      color: 'var(--muted-foreground)',
                      fontSize: '0.875rem'
                    }}
                  >
                    {new Date(pr.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 
