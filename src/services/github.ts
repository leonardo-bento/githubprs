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

export const getPullRequestsByMembers = async (reposToFetch: any[], memberUsernames: string[], pat: string) => { 
  let allPulls = [];
  // Step 2: Fetch pull requests for each repository
  for (const repo of reposToFetch) {
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const pullsUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/pulls?state=open&per_page=100&page=${page}`;
      const response = await fetch(pullsUrl, { headers: getHeaders(pat) });
      if (!response.ok) {
        // Log error but continue with other repos
        console.error(`Failed to fetch pull requests for ${repo.owner}/${repo.name}: ${response.statusText}`);
        break; // Stop fetching for this repo, move to next
      }
      const data = await response.json();
      allPulls = allPulls.concat(data.map(pr => ({ ...pr, repoName: repo.name, repoOwner: repo.owner })));
      hasNextPage = data.length === 100;
      page++;
    }
  }
  
  const filteredPulls = allPulls.filter(pr =>
    memberUsernames.includes(pr.user.login)
  );
  
  return filteredPulls;
}
