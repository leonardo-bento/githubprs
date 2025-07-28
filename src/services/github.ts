// GitHub API types
export interface GitHubUser {
  login: string;
  html_url: string;
}

export interface PullRequest {
  id: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: GitHubUser;
  state: 'open' | 'closed';
  created_at: string;
}

export interface GitHubSearchResponse {
  items: PullRequest[];
  total_count: number;
}

const getHeaders = (pat: string) => {
  return {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github.v3+json',
  };
}

export const getPullRequestsByMembers = async (
  organization: string, 
  memberUsernames: string[], 
  pat: string,
  lastDate: Date
): Promise<PullRequest[]> => { 
  let allPulls: PullRequest[] = [];
  // Step 2: Fetch pull requests for each repository
  let page = 1;
  let hasNextPage = true;
  
  const lastDateStr = lastDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  const authors = memberUsernames.join('+author:');
  
  while (hasNextPage) {
    const pullsUrl = `https://api.github.com/search/issues?q=is:pr+state:open+org:${organization}+created:>${lastDateStr}+author:${authors}&per_page=100&page=${page}`;
    const response = await fetch(pullsUrl, { headers: getHeaders(pat) });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch pull requests: ${response.statusText}`);
    }
    
    const data: GitHubSearchResponse = await response.json();
    allPulls = allPulls.concat(data.items);
    hasNextPage = data.items.length === 100;
    page++;
  }
  
  return allPulls;
}
