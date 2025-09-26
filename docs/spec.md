# XJR-3 Project Specification

This document is the single source of truth for XJR-3, a browser extension + backend + admin panel for team research paper tracking. It provides context for all prompts in `/docs/xjr3-prompts.md`. As a novice developer, use this to understand design decisions: Utilitarian UX (minimal, efficient), intuitive flows (2-3 clicks for tasks), scalability (small team focus).

## 1. Project Overview
- **Name**: XJR-3
- **Goal**: Prevent duplicate reads among team (you, NAJ, TAM). Extension detects/marks papers, backend stores/shares data, admin manages. Include publishYear for filtering, timestamps with local timezone + relative time (e.g., "6 hours ago") for read tracking.
- **Design Principles**: Utilitarian—core only (track, query, manage). Intuitive UX (non-intrusive badges, simple dashboards). Assume good intent, treat users as adults.
- **Tech Stack**: Extension (JS/HTML, date-fns), Backend (Node.js/Express), Admin (Next.js for SSR/routing, date-fns), DB (MongoDB Atlas), Shared (JS utils with date-fns). Tools: Trae/Cursor (GPT-4o, 60k tokens). Deployment: Vercel (backend/admin), sideloading (extension). Logo in `/public/logo.svg`.
- **Browsers**: Primary: Google Chrome (Manifest V3). Secondary: Firefox (Manifest V3 with adjustments, e.g., persistent background scripts). Build Chrome first, then adapt for Firefox.
- **Assumptions**: Team uses Chrome or Firefox, no store publish. Offline support via local storage sync. Timezone auto-detected from browser (e.g., Asia/Dhaka).

## 2. Monorepo Structure
- Root: `xjr3-tracker/`
  - `/extension`: manifest.chrome.json, manifest.firefox.json, content.js, background.js, popup.html/js, package.json (date-fns).
  - `/backend`: server.js, routes/ (paper.js, admin.js), models/ (paper.js, user.js, admin.js).
  - `/admin`: Next.js app—next.config.js, pages/ (index.js for login, dashboard.js, users.js, tools.js), components/, styles/, package.json (date-fns).
  - `/public`: logo.svg (shared asset for extension and admin).
  - `/shared`: paper.js (schema), auth.js (JWT/bcrypt), utils.js (helpers, timestamp formatting), config.js (settings).
  - `/docs`: spec.md (this file), xjr3-prompts.md, deployment-guide.md.
  - `package.json`: Workspaces ["extension", "backend", "admin"].
  - `.env`: MONGO_URI, JWT_SECRET, other secrets.
  - `.gitignore`: node_modules, .env.
- **Why Monorepo**: Unified context for Trae/Cursor. Relative imports (e.g., `../shared/paper.js`, `../public/logo.svg`). Single Git repo.

## 3. Database Schema (MongoDB)
- **Papers Collection**: Documents for each paper.
  - id: String (DOI/URL/hash, unique, indexed).
  - metadata: Object { title: String, authors: [String], abstract: String (optional), publishYear: Number | null (indexed) }.
  - reads: Array of Objects { user: String, timestamp: Date (UTC, displayed in local timezone), notes: String (optional) }.
  - Example: { id: "doi:10.1000/xyz", metadata: { title: "AI Paper", authors: ["Doe"], publishYear: 2023 }, reads: [{ user: "NAJ", timestamp: "2025-09-26T09:10:00Z", notes: "Key points" }] }.
- **Users Collection**: { username: String (unique), passwordHash: String }.
- **Admins Collection**: { adminUsername: String (unique), passwordHash: String, lastAccess: Date }.
- **Best Practices**: Mongoose, validate inputs (e.g., publishYear 1900–current). Index id, publishYear, reads.user. Aggregation for searches.

## 4. Authentication
- **User Auth (Extension)**: Username/password → JWT (localStorage). For API calls like /mark-read. Compatible with Chrome/Firefox.
- **Admin Auth (Panel)**: Separate username/password → Admin JWT (cookies, 1-hour expiry). No crossover.
- **Security**: Bcrypt hashing, HTTPS, rate-limiting, validate tokens. Assume good intent.

## 5. Core Features and Flows
- **Extension Flows** (Chrome first, Firefox adapted):
  - Install: Chrome (sideload via chrome://extensions/), Firefox (sideload via about:debugging). Share zip + README.
  - Onboarding: Popup login (username/password).
  - Browsing: Content script detects metadata (DOI, title, publishYear) → GET /check-paper → Tooltip: "Read by NAJ on 2025-09-26 15:10:00 +06 (6 hours ago)" (local timezone).
  - Marking: Click "Mark Read" → If read, dialog: "Read by NAJ at 15:10:00 +06 (6 hours ago). View notes or mark?" (View: GET /check-paper?details=true, Mark: POST /mark-read, Cancel). Check /shared/config.js (preventDuplicateReads).
  - Undo Read: "Remove My Read" button → DELETE /mark-read.
  - Dashboard: Table (Title | publishYear | Read By | Date & Time (e.g., 2025-09-26 15:10:00 +06 (6 hours ago)) | View Reads). Use /shared/utils.js for formatting, Intl.DateTimeFormat for timezone. Logo from /public/logo.svg.
  - Browser Notes: Use chrome || browser for APIs (e.g., chrome.runtime || browser.runtime). Chrome: Service worker for background.js. Firefox: Persistent background script.
- **Backend Flows**:
  - API: POST /mark-read (check preventDuplicateReads, store UTC timestamp), GET /check-paper (?details=true for full reads), GET /search-papers (UTC timestamps).
  - Admin: DELETE /mark-read (user undo), DELETE /admin/mark-read (admin undo), GET/POST /admin/config (toggle preventDuplicateReads).
- **Admin Panel Flows (Next.js)**:
  - Access: yourapp.vercel.app/admin → Login (logo: /public/logo.svg).
  - Dashboard: /dashboard → SSR table (Title | publishYear | Reads | Read Time (e.g., 2025-09-26 15:10:00 +06 (6 hours ago))). Client adjusts to local timezone.
  - Users: /users → Manage team.
  - Tools: /tools → Logs, cleanup, export CSV. Expand papers to delete reads (show local times + time ago). Toggle preventDuplicateReads.
- **Timezone**: Store UTC in DB, display local timezone (browser-detected via Intl.DateTimeFormat) with /shared/utils.js formatTimestampToLocal and formatTimeAgo (date-fns).
- **UX**: Non-intrusive (tooltips), accessible (ARIA), color-coded (green read). Errors: "Offline—queued".

## 6. Deployment and Testing
- **Extension**:
  - Chrome: Unpacked sideloading via chrome://extensions/. Updates: Share zip, reload.
  - Firefox: Unpacked sideloading via about:debugging. Updates: Share zip, reload.
- **Backend + Admin**: Vercel—deploy root. vercel.json: /api → backend, /admin → Next.js. Env vars for secrets.
- **Testing**: Unit (Jest), integration (Postman), manual (sideload, browse). Edge: Offline, invalid auth, timezone changes (e.g., switch to GMT+5). Test Chrome first, then Firefox (verify browser.* APIs).
- **Scalability**: Add WebSockets later if needed.

## 7. Best Practices and Iteration
- **Code Style**: Async/await, validate inputs (Joi), error handling. ESLint/Prettier.
- **Security**: HTTPS, no injection, API keys for team.
- **Performance**: Paginate searches, cache in extension, index DB (id, publishYear, reads.user).
- **Timezone**: UTC storage, local display (Intl.DateTimeFormat). Use date-fns for relative time.
- **Cross-Browser**: Use chrome || browser for APIs. Chrome: Service worker, strict permissions. Firefox: Persistent background, broader permissions. Test both.
- **Iteration**: Build shared → backend → extension (Chrome first, Firefox second) → admin. Test Chrome sideloading early, then Firefox. Get team feedback (e.g., "Are time ago displays clear?").
- **Novice Guidance**: Review Trae outputs (e.g., "Why use chrome || browser?"). Focus on small prompts.