import { mkdir, writeFile } from 'node:fs/promises';

const username =
  process.env.PROFILE_USERNAME ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  'MatsumotoMorami';
const token = process.env.GITHUB_TOKEN;
const assetsDir = new URL('../assets/', import.meta.url);

const colors = {
  bg: '#fff7fb',
  panel: '#ffffff',
  border: '#f3b6cf',
  text: '#40333d',
  muted: '#8d687c',
  pink: '#f08bb8',
  blue: '#7bb7ff',
  green: '#78d6a4',
  yellow: '#f6c76f',
};

const fallbackProfile = {
  login: username,
  repoCount: 0,
  stars: 0,
  forks: 0,
  followers: 0,
  contributions: 0,
  languages: [
    { name: 'TypeScript', color: '#3178c6', size: 35 },
    { name: 'Dart', color: '#00b4ab', size: 22 },
    { name: 'Rust', color: '#dea584', size: 20 },
    { name: 'JavaScript', color: '#f1e05a', size: 15 },
    { name: 'Vue', color: '#41b883', size: 8 },
  ],
};

async function main() {
  const profile = token ? await loadProfile() : fallbackProfile;
  await mkdir(assetsDir, { recursive: true });
  await writeFile(new URL('github-stats.svg', assetsDir), createStatsSvg(profile));
  await writeFile(new URL('top-langs.svg', assetsDir), createLanguagesSvg(profile));
}

async function loadProfile() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const to = now.toISOString();
  const repos = [];
  let user = null;
  let after = null;

  do {
    const data = await graphql(
      `query Profile($login: String!, $after: String, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          login
          followers {
            totalCount
          }
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              totalContributions
            }
          }
          repositories(
            first: 100
            after: $after
            ownerAffiliations: OWNER
            isFork: false
            privacy: PUBLIC
            orderBy: { field: UPDATED_AT, direction: DESC }
          ) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              stargazerCount
              forkCount
              languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
                edges {
                  size
                  node {
                    name
                    color
                  }
                }
              }
            }
          }
        }
      }`,
      { login: username, after, from, to },
    );

    user = data.user;
    repos.push(...user.repositories.nodes);
    after = user.repositories.pageInfo.endCursor;
  } while (user.repositories.pageInfo.hasNextPage);

  const languageMap = new Map();
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const current = languageMap.get(edge.node.name) || {
        name: edge.node.name,
        color: edge.node.color || colors.pink,
        size: 0,
      };
      current.size += edge.size;
      languageMap.set(edge.node.name, current);
    }
  }

  return {
    login: user.login,
    repoCount: user.repositories.totalCount,
    stars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    forks: repos.reduce((sum, repo) => sum + repo.forkCount, 0),
    followers: user.followers.totalCount,
    contributions:
      user.contributionsCollection.contributionCalendar.totalContributions,
    languages: [...languageMap.values()]
      .sort((a, b) => b.size - a.size)
      .slice(0, 6),
  };
}

async function graphql(query, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'MatsumotoMorami-profile-card-updater',
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(
      JSON.stringify(body.errors || body, null, 2),
    );
  }
  return body.data;
}

function createStatsSvg(profile) {
  const stats = [
    ['Public Repos', profile.repoCount, colors.pink],
    ['Stars', profile.stars, colors.yellow],
    ['Forks', profile.forks, colors.blue],
    ['Followers', profile.followers, colors.green],
    ['This Year', profile.contributions, colors.pink],
  ];

  const statItems = stats.map(([label, value, color], index) => {
    const x = 26 + (index % 3) * 156;
    const y = 86 + Math.floor(index / 3) * 66;
    return `
      <rect x="${x}" y="${y}" width="138" height="46" rx="12" fill="${colors.panel}" stroke="${color}" stroke-width="1.5"/>
      <text x="${x + 14}" y="${y + 20}" fill="${colors.muted}" font-size="12">${escapeXml(label)}</text>
      <text x="${x + 14}" y="${y + 37}" fill="${colors.text}" font-size="18" font-weight="700">${formatNumber(value)}</text>
    `;
  }).join('');

  return svg(520, 220, `
    <rect width="520" height="220" rx="20" fill="${colors.bg}" stroke="${colors.border}" stroke-width="2"/>
    <text x="28" y="42" fill="${colors.text}" font-size="24" font-weight="700">${escapeXml(profile.login)}'s GitHub</text>
    <text x="28" y="66" fill="${colors.muted}" font-size="14">little commits, useful projects, and cute experiments</text>
    ${statItems}
  `);
}

function createLanguagesSvg(profile) {
  const languages = profile.languages.length ? profile.languages : fallbackProfile.languages;
  const total = languages.reduce((sum, item) => sum + item.size, 0) || 1;
  let offset = 28;
  const bars = languages.map((item) => {
    const width = Math.max(8, Math.round((item.size / total) * 464));
    const rect = `<rect x="${offset}" y="78" width="${width}" height="14" rx="7" fill="${item.color || colors.pink}"/>`;
    offset += width;
    return rect;
  }).join('');

  const rows = languages.map((item, index) => {
    const y = 124 + index * 22;
    const percent = Math.round((item.size / total) * 1000) / 10;
    return `
      <circle cx="34" cy="${y - 4}" r="5" fill="${item.color || colors.pink}"/>
      <text x="48" y="${y}" fill="${colors.text}" font-size="14">${escapeXml(item.name)}</text>
      <text x="454" y="${y}" fill="${colors.muted}" font-size="13" text-anchor="end">${percent}%</text>
    `;
  }).join('');

  return svg(520, 260, `
    <rect width="520" height="260" rx="20" fill="${colors.bg}" stroke="${colors.border}" stroke-width="2"/>
    <text x="28" y="42" fill="${colors.text}" font-size="24" font-weight="700">Top Languages</text>
    <text x="28" y="66" fill="${colors.muted}" font-size="14">calculated from public non-fork repositories</text>
    <rect x="28" y="78" width="464" height="14" rx="7" fill="#f8dce9"/>
    ${bars}
    ${rows}
  `);
}

function svg(width, height, content) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>GitHub profile card</title>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
  ${content}
</svg>
`;
}

function formatNumber(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
