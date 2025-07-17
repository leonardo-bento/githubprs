'use client';

import { useState, useEffect } from 'react';
import { getRepositories, getPullRequestsByMembers } from '../services/github';

export default function Home() {
  // State variables for user inputs
  const [pat, setPat] = useState(''); // Personal Access Token
  const [organization, setOrganization] = useState(''); // GitHub Organization
  const [teamMembers, setTeamMembers] = useState(''); // Comma-separated list of team members
  const [pullRequests, setPullRequests] = useState([]); // List of fetched PRs
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

    let reposToFetch = [];

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
  // Function to fetch pull requests from GitHub
  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-4xl">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">GitHub Pull Request Lister</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="pat" className="block text-gray-700 text-sm font-bold mb-2">
              GitHub Personal Access Token (PAT):
            </label>
            <input
              type="password"
              id="pat"
              className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="e.g., ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-gray-500 mt-1">
              Requires 'repo' scope for private repositories. Create one in GitHub Settings &gt; Developer settings &gt; Personal access tokens.
            </p>
          </div>

          <div>
            <label htmlFor="organization" className="block text-gray-700 text-sm font-bold mb-2">
              GitHub Organization (Optional):
            </label>
            <input
              type="text"
              id="organization"
              className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g., octocat"
            />
            <p className="text-xs text-gray-500 mt-1">
              If specified, lists PRs across all repos in this organization.
            </p>
          </div>

          <div>
            <label htmlFor="teamMembers" className="block text-gray-700 text-sm font-bold mb-2">
              Team Members (GitHub Usernames, comma-separated):
            </label>
            <input
              type="text"
              id="teamMembers"
              className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={teamMembers}
              onChange={(e) => setTeamMembers(e.target.value)}
              placeholder="e.g., user1, user2, user3"
            />
            <p className="text-xs text-gray-500 mt-1">
              Only PRs opened by these users will be listed.
            </p>
          </div>
        </div>

        <div className="flex justify-center mb-6">
          <button
            onClick={fetchGitHubData}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 ease-in-out transform hover:scale-105"
            disabled={loading}
          >
            {loading ? 'Fetching PRs...' : 'Get Pull Requests'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        )}

        {message && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
            <strong className="font-bold">Info!</strong>
            <span className="block sm:inline"> {message}</span>
          </div>
        )}

        {pullRequests.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Open Pull Requests ({pullRequests.length})</h2>
            <div className="overflow-x-auto rounded-lg shadow">
              <table className="min-w-full leading-normal">
                <thead>
                  <tr>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tl-lg">
                      Title
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Repository
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Author
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider rounded-tr-lg">
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pullRequests.map((pr) => (
                    <tr key={pr.id} className="hover:bg-gray-50">
                      <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {pr.title}
                        </a>
                      </td>
                      <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                        <a href={pr.repository_url} target="_blank" rel="noopener noreferrer" className="text-gray-900">
                          {pr.repository_url}
                        </a>
                      </td>
                      <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                        <a href={pr.user.html_url} target="_blank" rel="noopener noreferrer" className="text-gray-900">
                          {pr.user.login}
                        </a>
                      </td>
                      <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                        <span className={`relative inline-block px-3 py-1 font-semibold leading-tight ${pr.state === 'open' ? 'text-green-900' : 'text-red-900'}`}>
                          <span aria-hidden="true" className={`absolute inset-0 opacity-50 rounded-full ${pr.state === 'open' ? 'bg-green-200' : 'bg-red-200'}`}></span>
                          <span className="relative">{pr.state}</span>
                        </span>
                      </td>
                      <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
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
