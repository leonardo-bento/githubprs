'use client';

import { useState, useEffect } from 'react';
import { getPullRequestsByMembers, PullRequest } from '../services/github';
import PullRequestsList from '../components/PullRequestsList';
import InputField from '../components/InputField';
import DateField from '../components/DateField';

export default function Home() {
  // State variables for user inputs
  const [pat, setPat] = useState(''); // Personal Access Token
  const [organization, setOrganization] = useState(''); // GitHub Organization
  const [teamMembers, setTeamMembers] = useState(''); // Comma-separated list of team members
  const [lastDate, setLastDate] = useState<string>(''); // Date filter for PRs (YYYY-MM-DD format)
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]); // List of fetched PRs
  const [loading, setLoading] = useState(false); // Loading state for API calls
  const [error, setError] = useState(''); // Error message state
  const [message, setMessage] = useState(''); // General message for user feedback

  // Set environment variables after component mounts (client-side only)
  useEffect(() => {
    setPat(process.env.NEXT_PUBLIC_PAT || '');
    setTeamMembers(process.env.NEXT_PUBLIC_USERS || '');
    setOrganization(process.env.NEXT_PUBLIC_ORGANIZATION || '');
    
    // Set default date to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setLastDate(yesterday.toISOString().split('T')[0]);
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
      let pullRequests = await getPullRequestsByMembers(organization, memberUsernames, pat, new Date(lastDate));

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
          <InputField
            id="pat"
            label="GitHub Personal Access Token (PAT):"
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="e.g., ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            description="Requires 'repo' scope for private repositories. Create one in GitHub Settings > Developer settings > Personal access tokens."
            required
          />

          <InputField
            id="organization"
            label="GitHub Organization (Optional):"
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="e.g., octocat"
            description="If specified, lists PRs across all repos in this organization."
          />

          <InputField
            id="teamMembers"
            label="Team Members (GitHub Usernames, comma-separated):"
            type="text"
            value={teamMembers}
            onChange={(e) => setTeamMembers(e.target.value)}
            placeholder="e.g., user1, user2, user3"
            description="Only PRs opened by these users will be listed."
          />

          <DateField
            id="lastDate"
            label="Search PRs created after:"
            value={lastDate}
            onChange={(e) => setLastDate(e.target.value)}
            description="Only pull requests created after this date will be shown. Defaults to yesterday if left empty."
            max={new Date().toISOString().split('T')[0]} // Don't allow future dates
          />
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

        <PullRequestsList pullRequests={pullRequests} />
      </div>
    </div>
  );
}
