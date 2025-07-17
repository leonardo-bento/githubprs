const getHeaders = (pat: string) => {
  return {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github.v3+json',
  };
}

export const getRepositories = async (organization: string, pat: string) => {
  let page = 1;
  let hasNextPage = true;
  let reposToFetch = [];
  while (hasNextPage) {
    const orgReposUrl = `https://api.github.com/orgs/${organization}/repos?per_page=100&page=${page}`;
    const response = await fetch(orgReposUrl, { headers: getHeaders(pat) });
    if (!response.ok) {
      throw new Error(`Failed to fetch organization repositories: ${response.statusText}`);
    }
    const data = await response.json();
    reposToFetch = reposToFetch.concat(data.map(repo => ({ owner: organization, name: repo.name })));
    hasNextPage = data.length === 100; // Check if there might be more pages
    page++;
  }
  return reposToFetch;
}

export const getPullRequestsByMembers = async (organization: string, memberUsernames: string[], pat: string) => { 
  let allPulls = [];
  // Step 2: Fetch pull requests for each repository
  let page = 1;
  let hasNextPage = true;
  let lastDate = new Date();
  lastDate.setDate(lastDate.getDate() - 1);
  const lastDateStr = lastDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  const authors = memberUsernames.join('+author:');
  while (hasNextPage) {
    const pullsUrl = `https://api.github.com/search/issues?q=is:pr+state:open+org:${organization}+created:>${lastDateStr}+author:${authors}&per_page=100&page=${page}`;
    const response = await fetch(pullsUrl, { headers: getHeaders(pat) });
    if (!response.ok) {
      // Log error but continue with other repos
      console.error(`Failed to fetch pull requests: ${response.statusText}`);
      break; // Stop fetching for this repo, move to next
    }
    const data = await response.json();
    allPulls = allPulls.concat(data.items);
    hasNextPage = data.length === 100;
    page++;
  }
  
  return allPulls;
}
