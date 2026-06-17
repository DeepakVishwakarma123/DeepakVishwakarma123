const https = require("https");
const fs = require("fs");
const path = require("path");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME; // e.g. "deepak123"
const README_PATH = process.env.README_PATH || "./README.md";

// Har repo ka alag color — cycle karta hai
const REPO_COLORS = [
  { bar: "#6366f1", light: "#e0e7ff", text: "#312e81" }, // indigo
  { bar: "#10b981", light: "#d1fae5", text: "#065f46" }, // emerald
  { bar: "#f59e0b", light: "#fef3c7", text: "#78350f" }, // amber
  { bar: "#ef4444", light: "#fee2e2", text: "#7f1d1d" }, // red
  { bar: "#8b5cf6", light: "#ede9fe", text: "#4c1d95" }, // violet
  { bar: "#06b6d4", light: "#cffafe", text: "#164e63" }, // cyan
  { bar: "#ec4899", light: "#fce7f3", text: "#831843" }, // pink
  { bar: "#84cc16", light: "#ecfccb", text: "#3f6212" }, // lime
];

// ─── GITHUB API HELPER ────────────────────────────────────────────────────────
function githubRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: endpoint,
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "User-Agent": "timeline-generator",
        Accept: "application/vnd.github.v3+json",
      },
    };

    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

// ─── FETCH ALL REPOS ──────────────────────────────────────────────────────────
async function fetchRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const batch = await githubRequest(
      `/users/${GITHUB_USERNAME}/repos?per_page=100&page=${page}&sort=created`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
    page++;
  }

  return repos.filter((r) => !r.fork); // sirf apne repos, forks nahi
}

// ─── FETCH FIRST TAG DATE ─────────────────────────────────────────────────────
async function fetchFirstTagDate(repoName) {
  try {
    const tags = await githubRequest(
      `/repos/${GITHUB_USERNAME}/${repoName}/tags`
    );
    if (!Array.isArray(tags) || tags.length === 0) return null;

    // Tags newest-first aate hain, so last wala oldest tag hai
    const oldestTag = tags[tags.length - 1];
    const tagDetail = await githubRequest(
      `/repos/${GITHUB_USERNAME}/${repoName}/git/refs/tags/${oldestTag.name}`
    );

    // Annotated tag vs lightweight tag handling
    let sha = tagDetail?.object?.sha;
    let type = tagDetail?.object?.type;

    if (type === "tag") {
      // Annotated tag — ek aur call chahiye
      const annotated = await githubRequest(
        `/repos/${GITHUB_USERNAME}/${repoName}/git/tags/${sha}`
      );
      return {
        date: annotated?.tagger?.date || null,
        name: oldestTag.name,
      };
    } else {
      // Lightweight tag — commit date lo
      const commit = await githubRequest(
        `/repos/${GITHUB_USERNAME}/${repoName}/git/commits/${sha}`
      );
      return {
        date: commit?.committer?.date || null,
        name: oldestTag.name,
      };
    }
  } catch {
    return null;
  }
}

// ─── FETCH COMMIT COUNT ───────────────────────────────────────────────────────
async function fetchCommitCount(repoName) {
  try {
    // Contributors endpoint se commit count milta hai efficiently
    const contributors = await githubRequest(
      `/repos/${GITHUB_USERNAME}/${repoName}/contributors?per_page=100`
    );
    if (!Array.isArray(contributors)) return 0;
    return contributors.reduce((sum, c) => sum + (c.contributions || 0), 0);
  } catch {
    return 0;
  }
}

// ─── BUILD REPO DATA ──────────────────────────────────────────────────────────
async function buildRepoData(repos) {
  const results = [];

  for (const repo of repos) {
    console.log(`  Processing: ${repo.name}`);

    const [tagInfo, commitCount] = await Promise.all([
      fetchFirstTagDate(repo.name),
      fetchCommitCount(repo.name),
    ]);

    results.push({
      name: repo.name,
      description: repo.description || "",
      startDate: new Date(repo.created_at),
      tagDate: tagInfo ? new Date(tagInfo.date) : null,
      tagName: tagInfo?.name || null,
      commitCount: commitCount,
      url: repo.html_url,
      language: repo.language || "Unknown",
    });
  }

  // Sirf woh repos jo tagged hain, baaki bhi dikhayenge as "In Progress"
  return results.sort((a, b) => a.startDate - b.startDate);
}

// ─── FORMAT DATE ──────────────────────────────────────────────────────────────
function fmtDate(date) {
  if (!date) return "Present";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── GENERATE SVG ─────────────────────────────────────────────────────────────
function generateSVG(repos) {
  // Layout constants
  const SVG_WIDTH = 900;
  const ROW_HEIGHT = 72;
  const LEFT_LABEL = 200;    // repo name column width
  const RIGHT_MARGIN = 20;
  const CHART_WIDTH = SVG_WIDTH - LEFT_LABEL - RIGHT_MARGIN;
  const TOP_PADDING = 60;
  const BOTTOM_PADDING = 40;

  // Sabse pehle aur sabse baad ki date nikaalo (for scaling)
  const allDates = repos.flatMap((r) =>
    [r.startDate, r.tagDate].filter(Boolean)
  );
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  // Thoda padding dete hain edges pe
  minDate.setDate(minDate.getDate() - 15);
  maxDate.setDate(maxDate.getDate() + 15);
  const totalMs = maxDate - minDate;

  function dateToX(date) {
    return LEFT_LABEL + ((date - minDate) / totalMs) * CHART_WIDTH;
  }

  const totalHeight =
    TOP_PADDING + repos.length * ROW_HEIGHT + BOTTOM_PADDING + 30;

  // Max commits — for bar height scaling
  const maxCommits = Math.max(...repos.map((r) => r.commitCount), 1);

  // ─── SVG START ──────────────────────────────────────────────────────────
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${totalHeight}" width="${SVG_WIDTH}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&amp;family=Inter:wght@400;500;600&amp;display=swap');
      text { font-family: 'Inter', system-ui, sans-serif; }
      .mono { font-family: 'JetBrains Mono', monospace; }
    </style>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00000018"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${SVG_WIDTH}" height="${totalHeight}" fill="#0f0f17" rx="16"/>

  <!-- Header -->
  <text x="20" y="30" fill="#ffffff" font-size="18" font-weight="600" letter-spacing="-0.5">
    🚀 Project Timeline
  </text>
  <text x="20" y="48" fill="#6366f1" font-size="11" class="mono">
    ${GITHUB_USERNAME} · Auto-generated on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
  </text>

  <!-- Grid lines (month markers) -->`;

  // Month markers
  const gridDate = new Date(minDate);
  gridDate.setDate(1);
  while (gridDate <= maxDate) {
    const x = Math.round(dateToX(gridDate));
    const label = gridDate.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
    svg += `
  <line x1="${x}" y1="${TOP_PADDING - 10}" x2="${x}" y2="${totalHeight - BOTTOM_PADDING}" stroke="#ffffff0a" stroke-width="1"/>
  <text x="${x}" y="${TOP_PADDING - 15}" fill="#ffffff30" font-size="9" text-anchor="middle" class="mono">${label}</text>`;
    gridDate.setMonth(gridDate.getMonth() + 1);
  }

  // ─── ROWS ───────────────────────────────────────────────────────────────
  repos.forEach((repo, i) => {
    const color = REPO_COLORS[i % REPO_COLORS.length];
    const y = TOP_PADDING + i * ROW_HEIGHT;
    const midY = y + ROW_HEIGHT / 2;

    const startX = Math.round(dateToX(repo.startDate));
    const endX = repo.tagDate
      ? Math.round(dateToX(repo.tagDate))
      : Math.round(dateToX(new Date())); // agar tag nahi toh aaj tak

    const barWidth = Math.max(endX - startX, 6);

    // Commit count → bar height (min 8px, max 28px)
    const barHeight = Math.round(
      8 + (repo.commitCount / maxCommits) * 20
    );
    const barY = midY - barHeight / 2;

    const isWIP = !repo.tagDate;

    svg += `
  <!-- Repo: ${repo.name} -->
  <!-- Row background on hover zone -->
  <rect x="0" y="${y + 2}" width="${SVG_WIDTH}" height="${ROW_HEIGHT - 4}" fill="${i % 2 === 0 ? "#ffffff04" : "transparent"}" rx="4"/>

  <!-- Repo name (left label) -->
  <text x="${LEFT_LABEL - 10}" y="${midY - 6}" fill="${color.bar}" font-size="12" font-weight="600" text-anchor="end">${repo.name}</text>
  <text x="${LEFT_LABEL - 10}" y="${midY + 8}" fill="#ffffff40" font-size="9" text-anchor="end" class="mono">${repo.language} · ${repo.commitCount} commits</text>

  <!-- Timeline track (faint line) -->
  <line x1="${LEFT_LABEL}" y1="${midY}" x2="${SVG_WIDTH - RIGHT_MARGIN}" y2="${midY}" stroke="#ffffff0a" stroke-width="1"/>

  <!-- Main bar (duration from start to tag/today) -->
  <rect x="${startX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="${color.bar}" rx="${barHeight / 2}" opacity="${isWIP ? "0.5" : "0.85"}" filter="url(#shadow)"/>

  ${isWIP
    ? `<!-- WIP dashed border -->
  <rect x="${startX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="none" stroke="${color.bar}" stroke-width="1.5" stroke-dasharray="4 3" rx="${barHeight / 2}" opacity="0.9"/>`
    : ""
  }

  <!-- Start dot -->
  <circle cx="${startX}" cy="${midY}" r="5" fill="${color.bar}" stroke="#0f0f17" stroke-width="2"/>

  <!-- End dot / tag badge -->
  ${repo.tagDate
    ? `<circle cx="${endX}" cy="${midY}" r="7" fill="${color.bar}" stroke="#0f0f17" stroke-width="2"/>
  <text x="${endX}" y="${midY + 4}" fill="#0f0f17" font-size="7" font-weight="700" text-anchor="middle" class="mono">✓</text>
  <!-- Tag label -->
  <rect x="${endX + 10}" y="${midY - 10}" width="${repo.tagName ? repo.tagName.length * 6 + 10 : 40}" height="16" fill="${color.bar}22" rx="8"/>
  <text x="${endX + 15 + (repo.tagName ? (repo.tagName.length * 6) / 2 : 15)}" y="${midY + 4}" fill="${color.bar}" font-size="9" class="mono" text-anchor="middle">${repo.tagName || "tagged"}</text>`
    : `<!-- WIP badge -->
  <rect x="${endX - 18}" y="${midY - 9}" width="36" height="14" fill="${color.bar}33" rx="7" stroke="${color.bar}" stroke-width="1" stroke-dasharray="3 2"/>
  <text x="${endX}" y="${midY + 4}" fill="${color.bar}" font-size="8" class="mono" text-anchor="middle">WIP</text>`
  }

  <!-- Start date label -->
  <text x="${startX}" y="${midY - barHeight / 2 - 6}" fill="#ffffff50" font-size="8" text-anchor="middle" class="mono">${fmtDate(repo.startDate)}</text>

  ${repo.tagDate
    ? `<text x="${endX}" y="${midY + barHeight / 2 + 14}" fill="${color.bar}aa" font-size="8" text-anchor="middle" class="mono">${fmtDate(repo.tagDate)}</text>`
    : ""
  }`;
  });

  // ─── LEGEND ─────────────────────────────────────────────────────────────
  const legendY = totalHeight - BOTTOM_PADDING + 15;
  svg += `
  <!-- Legend -->
  <circle cx="${LEFT_LABEL + 10}" cy="${legendY}" r="5" fill="#6366f1" stroke="#0f0f17" stroke-width="2"/>
  <text x="${LEFT_LABEL + 20}" y="${legendY + 4}" fill="#ffffff50" font-size="10">Start date</text>

  <circle cx="${LEFT_LABEL + 100}" cy="${legendY}" r="7" fill="#10b981" stroke="#0f0f17" stroke-width="2"/>
  <text x="${LEFT_LABEL + 115}" y="${legendY + 4}" fill="#ffffff50" font-size="10">First tag (shipped 🚀)</text>

  <rect x="${LEFT_LABEL + 260}" y="${legendY - 6}" width="30" height="10" fill="#ef444455" stroke="#ef4444" stroke-width="1" stroke-dasharray="3 2" rx="5"/>
  <text x="${LEFT_LABEL + 298}" y="${legendY + 4}" fill="#ffffff50" font-size="10">Work In Progress</text>

  <text x="${SVG_WIDTH - RIGHT_MARGIN}" y="${legendY + 4}" fill="#ffffff20" font-size="9" class="mono" text-anchor="end">Bar height = commit count</text>
</svg>`;

  return svg;
}

// ─── UPDATE README ────────────────────────────────────────────────────────────
function updateReadme(svgContent) {
  const START_MARKER = "<!-- TIMELINE_START -->";
  const END_MARKER = "<!-- TIMELINE_END -->";

  let readme = "";
  try {
    readme = fs.readFileSync(README_PATH, "utf8");
  } catch {
    readme = `# ${GITHUB_USERNAME}'s Projects\n\n`;
  }

  const svgBlock = `${START_MARKER}\n\n![Project Timeline](./timeline.svg)\n\n${END_MARKER}`;

  if (readme.includes(START_MARKER)) {
    // Replace existing block
    const regex = new RegExp(
      `${START_MARKER}[\\s\\S]*?${END_MARKER}`,
      "g"
    );
    readme = readme.replace(regex, svgBlock);
  } else {
    // Append at end
    readme += `\n\n## 📅 Project Timeline\n\n${svgBlock}\n`;
  }

  fs.writeFileSync(README_PATH, readme);
  console.log("✅ README updated!");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
    console.error(
      "❌ Set GITHUB_TOKEN and GITHUB_USERNAME environment variables!"
    );
    process.exit(1);
  }

  console.log(`\n🔍 Fetching repos for @${GITHUB_USERNAME}...`);
  const repos = await fetchRepos();
  console.log(`   Found ${repos.length} repos`);

  console.log("\n📊 Building repo data...");
  const repoData = await buildRepoData(repos);

  console.log("\n🎨 Generating SVG timeline...");
  const svg = generateSVG(repoData);

  // Save SVG
  const svgPath = path.join(path.dirname(README_PATH), "timeline.svg");
  fs.writeFileSync(svgPath, svg);
  console.log(`   SVG saved: ${svgPath}`);

  // Update README
  updateReadme(svg);

  console.log("\n✨ Done! Timeline generated successfully.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
