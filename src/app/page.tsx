'use client';

import { useState, useEffect } from 'react';
import { getPullRequestsByMembers, PullRequest } from '../services/github';

export default function Home() {
  // State variables for user inputs
  const [pat, setPat] = useState(''); // Personal Access Token
  const [organization, setOrganization] = useState(''); // GitHub Organization
  const [teamMembers, setTeamMembers] = useState(''); // Comma-separated list of team members
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]); // List of fetched PRs
  const [loading, setLoading] = useState(false); // Loading state for API calls
  const [error, setError] = useState(''); // Error message state
  const [message, setMessage] = useState(''); // General message for user feedback

  // Set environment variables after component mounts (client-side only)
  useEffect(() => {
    setPat(process.env.NEXT_PUBLIC_PAT || '');
    setTeamMembers(process.env.NEXT_PUBLIC_USERS || '');
    setOrganization(process.env.NEXT_PUBLIC_ORGANIZATION || '');
  }, []);

  const fetchGitHubData = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setPullRequests([]); // Clear previous PRs

    if (!pat) {
      setError('Please enter your GitHub Personal Access Token.');
      setLoading(false);
      return;
    }

    if (!organization) {
      setError('Please enter either an Organization name.');
      setLoading(false);
      return;
    }

    const memberUsernames = teamMembers.split(',').map(name => name.trim()).filter(name => name);

    try {
      let pullRequests = await getPullRequestsByMembers(organization, memberUsernames, pat);

      if (pullRequests.length === 0) {
        setMessage('No open pull requests found for the specified team members in the given repositories.');
      } else {
        setPullRequests(pullRequests);
      }

    } catch (err: any) {
      setError(`Error: ${err.message}. Please check your PAT and inputs.`);
      console.error('GitHub API error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--background)', 
      padding: 'var(--spacing-4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div className="card" style={{ 
        padding: 'var(--spacing-8)', 
        width: '100%', 
        maxWidth: '64rem'
      }}>
        <h1 style={{ 
          fontSize: '1.875rem', 
          fontWeight: 'bold', 
          textAlign: 'center', 
          color: 'var(--foreground)', 
          marginBottom: 'var(--spacing-6)'
        }}>
          GitHub Pull Request Lister
        </h1>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: 'var(--spacing-6)', 
          marginBottom: 'var(--spacing-6)'
        }}>
          <div>
            <label htmlFor="pat" className="label">
              GitHub Personal Access Token (PAT):
            </label>
            <input
              type="password"
              id="pat"
              className="input"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="e.g., ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--muted-foreground)', 
              marginTop: 'var(--spacing-1)'
            }}>
              Requires 'repo' scope for private repositories. Create one in GitHub Settings &gt; Developer settings &gt; Personal access tokens.
            </p>
          </div>

          <div>
            <label htmlFor="organization" className="label">
              GitHub Organization (Optional):
            </label>
            <input
              type="text"
              id="organization"
              className="input"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g., octocat"
            />
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--muted-foreground)', 
              marginTop: 'var(--spacing-1)'
            }}>
              If specified, lists PRs across all repos in this organization.
            </p>
          </div>

          <div>
            <label htmlFor="teamMembers" className="label">
              Team Members (GitHub Usernames, comma-separated):
            </label>
            <input
              type="text"
              id="teamMembers"
              className="input"
              value={teamMembers}
              onChange={(e) => setTeamMembers(e.target.value)}
              placeholder="e.g., user1, user2, user3"
            />
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--muted-foreground)', 
              marginTop: 'var(--spacing-1)'
            }}>
              Only PRs opened by these users will be listed.
            </p>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginBottom: 'var(--spacing-6)'
        }}>
          <button
            onClick={fetchGitHubData}
            className="button button-primary"
            disabled={loading}
            style={{
              padding: 'var(--spacing-2) var(--spacing-6)',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}
          >
            {loading ? 'Fetching PRs...' : 'Get Pull Requests'}
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            <strong style={{ fontWeight: 'bold' }}>Error!</strong>
            <span style={{ display: 'block' }}>{error}</span>
          </div>
        )}

        {message && (
          <div className="alert alert-warning">
            <strong style={{ fontWeight: 'bold' }}>Info!</strong>
            <span style={{ display: 'block' }}>{message}</span>
          </div>
        )}

        {pullRequests.length > 0 && (
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
                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="link">
                          {pr.title}
                        </a>
                      </td>
                      <td>
                        <a href={pr.repository_url} target="_blank" rel="noopener noreferrer" className="link">
                          {pr.repository_url}
                        </a>
                      </td>
                      <td>
                        <a href={pr.user.html_url} target="_blank" rel="noopener noreferrer" className="link">
                          {pr.user.login}
                        </a>
                      </td>
                      <td>
                        <span className={`status-badge status-${pr.state}`}>
                          {pr.state}
                        </span>
                      </td>
                      <td>
                        {new Date(pr.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
