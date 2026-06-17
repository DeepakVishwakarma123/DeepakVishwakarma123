# 🧑‍💻 Deepak's Projects

Auto-updating project timeline — har naya tag push karo aur yeh khud update ho jaata hai!

## 📅 Project Timeline

<!-- TIMELINE_START -->

![Project Timeline](./timeline.svg)

<!-- TIMELINE_END -->

---

## 🛠️ Setup Guide (5 min)

### Step 1 — Yeh files apne profile repo mein daalo

GitHub pe ek repo banao jiska naam exactly **tumhara username** ho.
Example: agar username `deepak-dev` hai toh repo ka naam `deepak-dev` hona chahiye.

```
your-username/          ← ye tera profile repo hai
├── .github/
│   └── workflows/
│       └── update-timeline.yml
├── scripts/
│   └── generate-timeline.js
├── timeline.svg         ← auto-generate hoga
└── README.md            ← yahi file
```

### Step 2 — Permissions check karo

Repo Settings → Actions → General → Workflow permissions:
✅ **"Read and write permissions"** select karo

### Step 3 — Pehli baar manually trigger karo

Actions tab → "Auto-Update Project Timeline" → "Run workflow"

### Step 4 — Aage se automatic!

Ab jab bhi kisi bhi repo mein tag push karo:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Timeline **automatically update** ho jaayegi! 🎉

---

## 🎨 Timeline Legend

| Element | Matlab |
|---------|--------|
| 🟣 Left dot | Repo create hua — start date |
| ✓ Right dot | Pehla tag push — shipped! |
| Bar height | Commit count (zyada commits = zyada mota bar) |
| `WIP` badge | Abhi tak koi tag nahi — kaam chal raha hai |
| Har repo ka alag color | Bas sahi dikhne ke liye 😄 |
