# Fantasy Golf — The Masters 2025
## Complete Setup Guide (No Experience Required)

---

## What You're Building

A private fantasy golf web app for friends, hosted free on GitHub Pages with a free Supabase database. Total cost: £0.

**What you'll need:**
- A GitHub account (free) → hosts the website
- A Supabase account (free) → stores all data (teams, scores, users)
- About 30–45 minutes for first-time setup

---

## PART 1: Set Up Supabase (Your Database)

Think of Supabase as your Excel spreadsheet — but one that your website can read and write to automatically.

### Step 1.1 — Create a Supabase account
1. Go to **https://supabase.com**
2. Click **Start your project** → Sign up with GitHub or email
3. Once logged in, click **New project**
4. Fill in:
   - **Name:** `fantasy-golf` (or anything you like)
   - **Database Password:** pick a strong password and save it somewhere
   - **Region:** pick the one closest to you (e.g. `West EU (Ireland)`)
5. Click **Create new project** — it takes ~2 minutes to provision

### Step 1.2 — Run the database schema
This creates all the tables (players, teams, scores, etc.) in one go.

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase_schema.sql` from this project folder
4. Copy the **entire contents** and paste it into the SQL editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see: `Success. No rows returned`

✅ Your database is ready. It now has:
- All Augusta National hole par values pre-loaded
- 30 Masters contenders pre-loaded with prices
- All the tables for users, rosters, and scores

### Step 1.3 — Get your API keys
1. In Supabase, click **Settings** (gear icon) in the left sidebar
2. Click **API**
3. You'll see two values — copy both:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

Keep these handy for Part 2.

### Step 1.4 — Make yourself an admin (after first login)
After you've created your account in the app (Part 3), come back here:
1. In Supabase, go to **Table Editor** → **profiles**
2. Find your row (your username/email)
3. Click the row, find the `is_admin` column, set it to `true`
4. Click **Save**

---

## PART 2: Set Up the Code on GitHub

### Step 2.1 — Create a GitHub account (if you don't have one)
1. Go to **https://github.com** and sign up (free)

### Step 2.2 — Create a new repository
1. Click the **+** icon → **New repository**
2. Name it: `fantasy-golf`
3. Set it to **Public** (required for free GitHub Pages hosting)
4. Click **Create repository**

### Step 2.3 — Upload the project files
**Option A — GitHub Desktop (easiest for beginners):**
1. Download **GitHub Desktop** from https://desktop.github.com
2. Sign in with your GitHub account
3. Click **File → Clone repository** → find `fantasy-golf`
4. Copy all files from this project folder into the cloned folder
5. In GitHub Desktop: write a commit message like "Initial setup", click **Commit**, then **Push**

**Option B — Command line (if you're comfortable with terminal):**
```bash
cd fantasy-golf
git init
git remote add origin https://github.com/YOUR_USERNAME/fantasy-golf.git
git add .
git commit -m "Initial setup"
git push -u origin main
```

### Step 2.4 — Add your Supabase keys as GitHub Secrets
This keeps your keys secure and out of the code.

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** — add these two:

| Secret Name | Value |
|---|---|
| `REACT_APP_SUPABASE_URL` | Your Supabase Project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | Your Supabase anon key |

### Step 2.5 — Add the GitHub Actions deployment file
Create a file at `.github/workflows/deploy.yml` with this content:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm install

      - name: Build
        env:
          REACT_APP_SUPABASE_URL: ${{ secrets.REACT_APP_SUPABASE_URL }}
          REACT_APP_SUPABASE_ANON_KEY: ${{ secrets.REACT_APP_SUPABASE_ANON_KEY }}
        run: npm run build

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./build
```

Commit and push this file.

### Step 2.6 — Enable GitHub Pages
1. Go to your repository → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Branch: select `gh-pages` → folder: `/ (root)`
4. Click **Save**

After ~2 minutes, your site will be live at:
**`https://YOUR_USERNAME.github.io/fantasy-golf`**

---

## PART 3: First Launch Checklist

### 3.1 — Create your admin account
1. Go to your live URL
2. Click **Register**
3. Sign up with your email, choose a username and team name
4. Go back to Supabase → Table Editor → profiles → set `is_admin = true` for your account (Step 1.4)
5. Refresh the app — you'll now see the **Admin** tab

### 3.2 — Check player prices (Admin → Players)
- All 30 players are pre-loaded with estimated prices
- Adjust any prices using the edit button (pencil icon)
- The **Price Override** field lets you manually set a final price
- Form scores are on a 0–10 scale — adjust based on recent tournament results

### 3.3 — Invite your friends
Share your URL with friends. They:
1. Go to the URL
2. Click **Register** → enter email, password, username, team name
3. Head to **Draft** and pick their team

### 3.4 — Before the tournament starts
- Keep **Draft Open** = ON so friends can pick their teams
- Keep **Roster Lock** = OPEN
- Set **Current Round** = 0 (pre-tournament)

### 3.5 — When the tournament starts (Thursday)
1. Admin → Tournament → Set **Current Round = 1**
2. Toggle **Roster Lock = Locked** (the night before Round 1 starts)
3. Toggle **Draft Open = Closed**

### 3.6 — Entering scores (each day)
1. Admin → Scores tab
2. Select a player from the dropdown
3. Select the round
4. Enter strokes per hole (e.g. hole 1 = 4 strokes, par 4 → shows as E)
5. Click **Save Scores**
6. Repeat for each player in rosters

**Tip:** You only need to enter scores for players who are in someone's team — not the entire field.

### 3.7 — Between rounds
- Unlock rosters so users can make substitutions
- Users go to **My Team** → click the swap icon to substitute players
- Re-lock rosters before the next round starts

### 3.8 — After the cut (after Round 2)
- Admin → Players → find players who missed cut
- Edit them → tick **Missed Cut** → Save
- These players show a CUT badge on everyone's team

---

## Scoring Rules (Summary for Players)

| Rule | Detail |
|---|---|
| **Budget** | £100 to spend on 8 players |
| **Starters** | Pick 5 — best 4 scores count each round |
| **Substitutes** | Pick 3 — can swap with starters between rounds |
| **Scoring** | vs par (birdie = −1, bogey = +1, etc.) |
| **Winner** | Lowest cumulative score after 4 rounds |
| **Lock** | Rosters lock the night between rounds |

---

## Troubleshooting

**"Missing Supabase environment variables"**
→ Your `.env` file or GitHub Secrets aren't set correctly. Double-check the values.

**Can't log in / "Email not confirmed"**
→ Go to Supabase → Authentication → Settings → turn off **Email confirmations** (easier for friends app).

**Scores not showing up**
→ Make sure Current Round is set to the right round in Admin → Tournament.

**Player not showing in draft**
→ Check Admin → Players that the player has `is_active = true`.

**Site not updating after push**
→ Check the Actions tab on GitHub to see if the build succeeded. It takes 1–2 minutes.

---

## Player Pricing Formula (for reference)

```
Price = (Ranking Score × 0.4) + (Odds Score × 0.4) + (Form Score × 0.2)
```

- **Ranking score:** World ranking scaled 1–10 (rank 1 = 10, rank 200 = 1)
- **Odds score:** Decimal odds scaled 1–10 (shorter odds = higher score)  
- **Form score:** Admin-set 0–10 based on last 5 tournament performances
- **Price override:** Admin can manually set any player's final price

---

## File Structure Reference

```
fantasy-golf/
├── public/
│   └── index.html
├── src/
│   ├── components/shared/
│   │   └── Navbar.jsx         ← Top navigation bar
│   ├── hooks/
│   │   ├── useAuth.js         ← Login state management
│   │   └── useTournament.js   ← Tournament state
│   ├── lib/
│   │   └── supabase.js        ← All database functions
│   ├── pages/
│   │   ├── LoginPage.jsx      ← Login & register
│   │   ├── LeaderboardPage.jsx ← Fantasy standings
│   │   ├── DraftPage.jsx      ← Pick your team
│   │   ├── MyTeamPage.jsx     ← View team + scores
│   │   └── AdminPage.jsx      ← Admin tools
│   ├── App.jsx                ← Routing
│   ├── index.js               ← Entry point
│   └── index.css              ← Styles & theme
├── supabase_schema.sql        ← Run this in Supabase once
├── .env.example               ← Copy to .env, fill in keys
└── package.json
```

---

*Built for friends · Augusta National · Masters 2025*
