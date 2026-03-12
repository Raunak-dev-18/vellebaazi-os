# Contect

## Purpose
This file is the canonical, deep project context and the running change log. Every repo change must be recorded here in the **Change Log** section with date, summary, and files touched.

## Project Summary
- Velle Baazi is a social media web app inspired by Instagram with posts, reels (Timepass), stories, messaging (Bakaiti), notifications, profiles, and settings.
- Frontend is a Vite + React 18 + TypeScript SPA with React Router and Tailwind/shadcn UI.
- Core backend services are Firebase Auth + Realtime Database, with media stored in an external Storage API (Skyflare storage endpoint).
- Optional AI assistant (@cognix) is powered by Google Gemini streaming responses inside chat.

## Tech Stack
- Runtime: React 18, TypeScript, Vite
- Styling/UI: Tailwind CSS, shadcn/ui, Radix UI, lucide-react icons
- State/data: React Query, React Context
- Auth: Firebase Auth (Email/Password + Google OAuth)
- Data: Firebase Realtime Database
- Media: Storage API (Skyflare) via REST
- AI: Google Gemini API
- Routing: React Router v6

## App Architecture
- Single-page app bootstrapped in `src/main.tsx` and routed in `src/App.tsx`.
- Providers: ThemeProvider, React Query, Tooltip, Toaster, Router, AuthProvider.
- Protected routes: All main routes are gated by `ProtectedRoute` (redirects to `/login`).
- Lazy loading: Pages are lazy-loaded with React `Suspense` and a splash screen.
- Global UX: right-click is disabled on images/videos via a global listener.

## Routing Map
- `/login` public auth page
- `/terms`, `/privacy` public legal pages
- `/` Home feed
- `/timepass` Reels feed
- `/bakaiti` Messaging
- `/create` Create post/reel flow
- `/profile` Own profile
- `/settings` Account + privacy settings
- `/explore` Explore page
- `/notifications` Activity notifications
- `/users/profile/:username` Public user profile

## Data Model (Realtime Database)
Table of key paths and usage based on current code:

| Path | Purpose | Notes |
| --- | --- | --- |
| `users/{uid}` | User profile data | `username`, `email`, `photoURL`, `gender`, `accountPrivacy`, `createdAt` |
| `posts/{postId}` | Posts and reels | `mediaUrl`, `mediaType`, `postType`, `caption`, `likes`, `comments`, `views`, `createdAt` |
| `stories/{storyId}` | Stories | `userId`, `mediaUrl`, `mediaType`, `createdAt`, `expiresAt` (24h) |
| `likes/{postId}/{uid}` | Post likes | Also used for reels |
| `comments/{postId}/{commentId}` | Post comments | Includes nested `replies` and per-comment `likes` |
| `followers/{uid}/{followerUid}` | Followers | Simple list with username + timestamp |
| `following/{uid}/{followingUid}` | Following | Simple list with username + timestamp |
| `followRequests/{uid}/{requestId}` | Private account follow requests | `fromUserId`, `status` |
| `notifications/{uid}/{notificationId}` | Notifications | Types include `follow`, `follow_request`, `follow_request_accepted`, `follow_request_blocked` |
| `userChats/{uid}/{chatId}` | Chat list metadata | `lastMessage`, `lastMessageTime`, `otherUserId`, avatar |
| `messages/{chatId}/{messageId}` | Chat messages | Supports text, attachments, reactions, forwards |
| `typing/{chatId}/{uid}` | Typing indicator | Boolean-ish updates |
| `deletedMessages/{uid}/{chatId}/{messageId}` | Per-user message deletes | Used for local deletion |

## Core Feature Flows
**Authentication**
- On auth state change, user is synced to `users/{uid}` if missing.
- Email/password sign up sets displayName and creates `users/{uid}` record.
- Google sign-in creates `users/{uid}` if new.

**Home Feed**
- Reads `posts` and filters by privacy using `users/{uid}.accountPrivacy`.
- Shows only image posts (filters out video/reel media).
- Infinite scrolling by batches of 5.

**Reels (Timepass)**
- Reads `posts`, filters to `mediaType=video` or `postType=reel`.
- Snap scroll full-screen feed with auto-play videos.
- Supports likes and comments in a side modal.

**Stories**
- Stories are stored in `stories`, expiring after 24 hours.
- Local cleanup runs every minute to delete expired stories.
- Images can be edited via `StoryEditor` before upload.

**Posts & Comments**
- Posts created in `Create` upload media to Storage API, then write to `posts`.
- Comments live under `comments/{postId}` with nested replies.
- Likes stored under `likes/{postId}/{uid}` and mirrored in `posts/{postId}.likes`.

**Messaging (Bakaiti)**
- Chats keyed by a stable `chatId` from sorted user IDs.
- `userChats` stores chat list metadata per user.
- `messages` stores text, files, reactions, forwarded messages, and deletion metadata.
- Typing indicator uses `typing/{chatId}/{uid}`.
- Supports @cognix AI replies by streaming Gemini responses and updating messages.

**Notifications**
- Follow, follow request, and acceptance are written to `notifications/{uid}`.
- Private account requests use `followRequests/{uid}`.

## External Services & APIs
- Firebase (Auth + Realtime DB + Storage + Firestore init in `src/lib/firebase.ts`).
- Storage API (Skyflare) in `src/lib/storage.ts` using `VITE_STORAGE_*` env vars.
- Gemini API in `src/lib/ai.ts` for chat AI responses.
- Giphy API key is expected in `.env` for chat GIFs (usage in chat components).
- A4F API key and base URL are listed in `.env.example` for image editing/generation.

## Configuration & Build
- `vite.config.ts` sets `server.port=8080` and uses module alias `@ -> src`.
- Manual chunking for vendor, firebase, radix, router, etc.
- Scripts in `package.json`:
  - `npm run dev` starts Vite dev server
  - `npm run build` builds for production
  - `npm run lint` runs eslint
  - `npm run preview` serves the build

## Security & Secrets Notes
- `storage-docs.txt` contains a bearer token. This should be treated as sensitive and ideally moved out of version control.
- `.env` exists in repo root; avoid committing real secrets.
- `src/lib/firebase.ts` currently hardcodes Firebase config rather than reading `.env`.

## Notable UI/UX Details
- Right-click disabled on images/videos globally.
- Story ring uses gradient and hover scaling.
- Timepass has snap scroll and double-tap heart animation.

## Change Log
- 2026-02-05: Created `contect.md` and added `AGENTS.md` instruction to keep this log updated.
- 2026-02-05: Added like/follow de-duplication guards and deterministic follow request keys; made post media in `PostCard` responsive to any aspect ratio. Files touched: `src/components/PostCard.tsx`, `src/pages/Home.tsx`, `src/pages/Notifications.tsx`, `src/pages/Timepass.tsx`, `src/pages/UserProfile.tsx`.
- 2026-02-05: Disabled follow button on own profile to prevent self-follow UI confusion. Files touched: `src/pages/UserProfile.tsx`.
- 2026-02-05: Fixed lint errors and warnings by adding explicit types for Firebase data, cleaning hook deps, extracting mention utilities, and adjusting ESLint directives; updated Tailwind config import style. Files touched: `src/components/MentionInput.tsx`, `src/components/MentionTextarea.tsx`, `src/components/MentionText.tsx`, `src/components/NotificationsDialog.tsx`, `src/components/PostCard.tsx`, `src/components/Stories.tsx`, `src/components/chat/GifPicker.tsx`, `src/components/theme-provider.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/ui/command.tsx`, `src/components/ui/form.tsx`, `src/components/ui/navigation-menu.tsx`, `src/components/ui/sidebar.tsx`, `src/components/ui/sonner.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/toggle.tsx`, `src/contexts/AuthContext.tsx`, `src/pages/Create.tsx`, `src/pages/Explore.tsx`, `src/pages/Home.tsx`, `src/pages/Login.tsx`, `src/pages/Notifications.tsx`, `src/pages/Profile.tsx`, `src/pages/Settings.tsx`, `src/pages/Timepass.tsx`, `src/pages/UserProfile.tsx`, `src/utils/cleanupFollowData.ts`, `src/utils/mentions.ts`, `tailwind.config.ts`.
- 2026-02-05: Fixed Create mentions import path resolution and restored `cleanedCount` mutability; lint clean. Files touched: `src/pages/Create.tsx`, `src/utils/cleanupFollowData.ts`.
- 2026-02-07: Ran `npm audit fix` to update dependencies and reduce reported vulnerabilities; remaining issues require a Vite major upgrade. Files touched: `package-lock.json`.
- 2026-02-07: Moved storage credentials behind a simple server-side proxy route; client now calls `/api/storage/*` and dev server proxies to the storage proxy. Files touched: `server/storage-proxy.mjs`, `src/lib/storage.ts`, `vite.config.ts`, `.env.example`, `package.json`, `package-lock.json`, `README.md`.
- 2026-02-07: Updated `.env` to move storage credentials to server-only variables and added proxy base override. Files touched: `.env`.
- 2026-02-07: Handled storage proxy directly inside Vite dev server so only one server is needed in development. Files touched: `vite.config.ts`, `README.md`.
- 2026-02-07: Adjusted Vite dev storage proxy middleware to avoid express type dependency while keeping single-server dev flow. Files touched: `vite.config.ts`.
- 2026-02-07: Improved Vite dev storage proxy env loading and error logging to surface missing config and upstream failures. Files touched: `vite.config.ts`.
- 2026-02-08: Improved storage upload/delete error handling with clearer proxy/env diagnostics, surfaced real upload errors in post creation toast, and enabled storage proxy middleware for Vite preview mode. Files touched: `src/lib/storage.ts`, `src/pages/Create.tsx`, `vite.config.ts`, `contect.md`.
- 2026-02-08: Fixed TypeScript diagnostics in `vite.config.ts` by adding explicit Express/Vite server parameter types and installing missing type packages for `express` and `multer`. Files touched: `vite.config.ts`, `package.json`, `package-lock.json`, `contect.md`.
- 2026-03-11: Added PWA install support with manifest, service worker registration/caching, generated install icons, and a top-right install button that appears in browser mode only and auto-hides after 15 seconds. Files touched: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/components/PwaInstallPrompt.tsx`, `public/manifest.webmanifest`, `public/sw.js`, `public/pwa-192.png`, `public/pwa-512.png`, `contect.md`.
- 2026-03-11: Redesigned app shell for better mobile/tablet UX with Instagram-style top/bottom navigation, simplified desktop sidebar routes, improved home feed spacing, and added a functional Groups module with realtime create/chat/member management and role controls (`admin`, `member`). Files touched: `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/components/MobileTopBar.tsx`, `src/components/MobileBottomNav.tsx`, `src/pages/Home.tsx`, `src/pages/Groups.tsx`, `contect.md`.
- 2026-03-11: Fixed dev dynamic-import instability by disabling and cleaning service workers/caches in development, refined mobile chrome to closer Instagram-style icon bars, and upgraded Groups with admin-editable group info, member mentions (`@username`) autocomplete, and image sharing in group chat messages. Files touched: `src/main.tsx`, `src/components/MobileTopBar.tsx`, `src/components/MobileBottomNav.tsx`, `src/pages/Groups.tsx`, `contect.md`.
- 2026-03-11: Merged direct chats and group chats into a single `Bakaiti` inbox page, added mobile two-screen chat flow (list screen -> conversation screen), moved group creation into the same inbox UI, and removed standalone Groups navigation entry points so chat/group experience is unified. Files touched: `src/pages/Bakaiti.tsx`, `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/components/MobileTopBar.tsx`, `contect.md`.
- 2026-03-11: Fixed storage upload 500 error ("fetch failed") caused by stale env loading; the Vite storage proxy was resolving to the old `storageapis.skyflare.sh` domain instead of `storageapis.r8dev.qzz.io`. Updated `.env.example` to use the correct URL and added detailed error logging (including `error.cause`) to the storage proxy in `vite.config.ts` for easier future debugging. Files touched: `vite.config.ts`, `.env.example`, `contect.md`.
- 2026-03-11: Added Instagram-style social enhancements across stories, chat, posts, settings, and notifications: close-friends management in Privacy settings, close-friends story audience and visibility filtering, mention-aware messaging in unified `Bakaiti`, mention notifications for post captions/comments/stories/group chats, and a functional Mentions notifications tab. Files touched: `src/pages/Settings.tsx`, `src/components/Stories.tsx`, `src/components/StoryEditor.tsx`, `src/pages/Bakaiti.tsx`, `src/pages/Create.tsx`, `src/components/PostCard.tsx`, `src/pages/Notifications.tsx`, `src/utils/mentionNotifications.ts`, `contect.md`.
- 2026-03-11: Added privacy/security foundation upgrades: client-side E2EE envelopes for DM/group chat text in unified `Bakaiti`, encrypted media-link storage for close-friends stories, block/unblock user management (profile actions + settings list), block-aware follow/chat enforcement, stricter input validation (username/group/message), and privacy-change notification events. Files touched: `src/pages/Bakaiti.tsx`, `src/components/Stories.tsx`, `src/pages/UserProfile.tsx`, `src/pages/Settings.tsx`, `src/pages/Home.tsx`, `src/pages/Notifications.tsx`, `src/components/NotificationsDialog.tsx`, `src/utils/e2ee.ts`, `src/utils/blocking.ts`, `src/utils/validation.ts`, `contect.md`.
- 2026-03-11: Added Instagram-style minimal post sharing flow: tapping Send on a post opens a compact share dialog, users can search/select DM or group targets, shared posts are delivered into chat/group threads with secure text envelope support and rendered as shared-post preview cards in unified `Bakaiti`. Files touched: `src/components/chat/SharePostDialog.tsx`, `src/components/PostCard.tsx`, `src/pages/Bakaiti.tsx`, `contect.md`.
- 2026-03-11: Fixed Vite dev server blocked-host error by adding `vellebaazi.raunakdev.me` to `server.allowedHosts` in `vite.config.ts`. Files touched: `vite.config.ts`, `contect.md`.
- 2026-03-11: Fixed blank-screen runtime mismatch (`_jsxDEV is not a function`) by hardening startup/service-worker behavior: added one-time runtime recovery that clears service workers/caches and reloads on known stale-bundle errors, bumped service-worker cache version, switched asset fetching to network-first for `/assets/*` and navigations, and skipped SW interception for Vite dev module paths (`/src`, `/node_modules`, `/@vite`, `/@id`, `/@fs`) plus `/api` routes. Files touched: `src/main.tsx`, `public/sw.js`, `contect.md`.
- 2026-03-11: Improved light/dark color flow and text readability by rebalancing global theme tokens (background, muted, border, sidebar palettes), switching sidebar border/text styling to mode-aware sidebar tokens, and strengthening Home feed/suggestions/footer text/link contrast with semantic and dark-aware classes. Files touched: `src/index.css`, `src/components/AppSidebar.tsx`, `src/pages/Home.tsx`, `contect.md`.
- 2026-03-11: Hardened blank-screen recovery across local/prod runtime mismatches by upgrading startup recovery logic (multi-attempt windowed cache/SW reset + global error/unhandled rejection hooks + recovery query cleanup), simplifying service worker fetch strategy to network-first/no asset write-through cache with offline fallback page, and adding a visible HTML boot fallback message when JS cannot load (e.g., browser Offline throttling). Files touched: `src/main.tsx`, `public/sw.js`, `public/offline.html`, `index.html`, `contect.md`.
- 2026-03-11: Forced stale service-worker eviction path for production clients by versioning the registration URL (`/sw.js?v=20260311-2`) and bumping runtime cache namespace to `velle-baazi-v4`, reducing chances of `_jsxDEV`/bundle mismatch from cached worker scripts after deploys. Files touched: `src/main.tsx`, `public/sw.js`, `contect.md`.
- 2026-03-11: Removed unused Firestore initialization from Firebase setup (app now initializes only Auth, Realtime Database, and Storage) and fixed misleading Home feed error copy to reference Realtime Database/offline state instead of Firestore; also updated timestamp comment wording. Files touched: `src/lib/firebase.ts`, `src/pages/Home.tsx`, `contect.md`.
- 2026-03-11: Removed production startup fallback screen from `index.html` and stabilized PWA runtime by simplifying service worker to install/activate-only (no fetch interception), plus simplified startup recovery back to single known-mismatch self-heal and bumped SW registration URL to `sw.js?v=20260311-3` to force stale worker replacement. Files touched: `index.html`, `public/sw.js`, `src/main.tsx`, `contect.md`.
- 2026-03-11: Removed obsolete offline fallback document after disabling service-worker fetch interception so production users no longer see developer-style startup/offline placeholder screens. Files touched: `public/offline.html`, `contect.md`.
- 2026-03-11: Added a full Realtime Database security ruleset tailored to current app data paths and flows (users, posts, likes/comments/replies, stories, follows/requests/notifications, DM/group chat, groups membership/roles, close friends, blocks, and E2EE key material), replacing the empty rules file so production RTDB access can be enforced with authenticated path-level controls. Files touched: `rtdb-rules.json`, `contect.md`.
- 2026-03-11: Fixed mobile profile alignment/overflow issues by making own-profile and user-profile headers responsive (smaller avatar/gaps on phones, wrapped action buttons, truncation for long usernames, break-word bio text, and x-overflow guards) so screens no longer clip or side-scroll on narrow devices. Files touched: `src/pages/Profile.tsx`, `src/pages/UserProfile.tsx`, `contect.md`.
- 2026-03-11: Fixed Render production deployment reliability for `_jsxDEV is not a function` class of failures by adding a production `start` script that serves built assets via Vite preview with Render `PORT`, introducing a `render.yaml` with explicit build/start commands, adding startup misconfiguration logging when dev mode runs on non-local hosts, and documenting Render deploy commands in README. Files touched: `package.json`, `server/start-preview.mjs`, `render.yaml`, `src/main.tsx`, `README.md`, `contect.md`.
- 2026-03-11: Tightened story visibility to show only owners the viewer follows (plus self), while still allowing close-friends stories/public stories from owners who explicitly added the viewer to close friends; fixed production group creation permission errors by adding parent-level `groups/$groupId` write rule and making group-member writes deterministic (creator admin first, then other members). Files touched: `src/components/Stories.tsx`, `src/pages/Bakaiti.tsx`, `rtdb-rules.json`, `contect.md`.
- 2026-03-11: Added a hardened dev launcher wrapper that forces `NODE_ENV=development` for `npm run dev` (`server/start-dev.mjs`) to prevent React JSX runtime mismatch crashes (`_jsxDEV is not a function`) when platforms accidentally run dev mode with production env vars; updated `package.json` `dev` script to use this wrapper. Files touched: `server/start-dev.mjs`, `package.json`, `contect.md`.
- 2026-03-11: Further hardened production behavior for remaining group-create and close-friends story edge cases: group metadata creation now writes child paths explicitly (compatible with stricter/partially-updated rules), group creation no longer hard-fails when post-create E2EE key setup is denied/late, create-group errors now include actual failure reason, and close-friends owner lookups in story fetching are isolated so one permission/read failure cannot hide all stories. Files touched: `src/pages/Bakaiti.tsx`, `src/components/Stories.tsx`, `contect.md`.
- 2026-03-11: Expanded Instagram-like group and story UX: added group member management UI in unified `Bakaiti` (view members, follow members with private-account request flow, admin add members, admin promote/demote member roles, and admin remove members, with system activity messages), plus upgraded story viewing to a cleaner Instagram-style full-screen card with animated per-story progress bars, timed auto-advance, richer top overlays, and larger tap zones for navigation. Files touched: `src/pages/Bakaiti.tsx`, `src/components/Stories.tsx`, `contect.md`.
- 2026-03-11: Hardened production compatibility for Timepass/chat permissions and lazy-chunk failures: switched post like/comment counter writes in feed/reels to field-level RTDB transactions (`posts/{postId}/likes`, `posts/{postId}/comments`) to avoid whole-post write rejections, added global runtime recovery hooks for lazy-import chunk fetch errors after navigation, and relaxed/realigned post/group/close-friends/E2EE rule checks for current app write patterns (including removal of fragile `taggedUsers` equality from non-owner post counter updates). Files touched: `src/components/PostCard.tsx`, `src/pages/Timepass.tsx`, `src/main.tsx`, `rtdb-rules.json`, `contect.md`.
- 2026-03-11: Fixed close-friends story visibility and unstable group chat sends in unified inbox: story permission checks now evaluate close-friend eligibility for followed users' `close_friends` stories (previously skipped), stale `userGroups` entries are auto-cleaned when `groupMembers` access is invalid/missing, group send now validates membership and exits gracefully with cleanup, and E2EE key-setup failures during send/share now fall back to standard message payload instead of hard-failing chat actions. Files touched: `src/components/Stories.tsx`, `src/pages/Bakaiti.tsx`, `src/components/chat/SharePostDialog.tsx`, `contect.md`.
- 2026-03-11: Fixed persistent Bakaiti DM/group send failures and restored media picker UX: DM send path now self-heals missing `userChats` mappings before message writes, message send no longer hard-fails on peer/metadata update errors after successful payload write, E2EE now auto-falls back to standard mode per-conversation on permission-denied key setup, and DM composer now includes a GIF/Sticker picker with Giphy-backed tabs plus selected-GIF send support. Also relaxed DM E2EE rules to remove false permission blocks while keeping group-scope E2EE membership checks. Files touched: `src/pages/Bakaiti.tsx`, `src/components/chat/GifPicker.tsx`, `rtdb-rules.json`, `contect.md`.
- 2026-03-11: Fixed remaining Bakaiti send regressions and polished GIF compose UX: message payload writes now omit undefined encryption fields (prevents RTDB `set failed: value argument contains undefined` on DM/group sends), share-to-chat post payloads now use the same undefined-safe envelope, chat list preview for GIF sends is simplified to `GIF`, and selected GIF in composer now shows an Instagram-style thumbnail preview card instead of a plain text row. Files touched: `src/pages/Bakaiti.tsx`, `src/components/chat/SharePostDialog.tsx`, `contect.md`.
- 2026-03-11: Enabled GIF/Sticker picker in group chats within unified `Bakaiti` so media replies are available in both DM and groups (removed DM-only gating for picker visibility and trigger button). Files touched: `src/pages/Bakaiti.tsx`, `contect.md`.
- 2026-03-11: Fixed story visibility reliability for followed and close-friends audiences by hardening story feed parsing/loading: normalized legacy/mixed story record shapes and timestamp formats during fetch, supported nested legacy story maps while preserving owner IDs, and isolated encrypted-story decrypt failures per item so one stale/undecryptable close-friends story no longer breaks the entire story rail for all users. Files touched: `src/components/Stories.tsx`, `contect.md`.
- 2026-03-11: Added Instagram-style message actions in unified `Bakaiti`: per-message `Reply`, `React`, and `Forward` options; inline reply context in composer and bubbles; forwarded-message metadata badges; reaction chips with toggle behavior; and a reaction picker that supports quick emojis plus typed/pasted custom emojis. Updated RTDB rules to permit participant-scoped reaction writes on DM/group message reaction subpaths and allow new `replyTo`/`forwardedFrom` message metadata fields. Files touched: `src/pages/Bakaiti.tsx`, `rtdb-rules.json`, `contect.md`.
- 2026-03-11: Added Instagram-style story engagement and nav unread indicators: stories now support realtime reactions, comments, and direct DM replies from the story viewer with upgraded full-screen UI/action bar; notifications page now auto-marks unread items as read and supports new `story_reaction`/`story_comment`/`story_reply` text labels; sidebar/mobile top icons now show unread count circles for `Notifications` and `Bakaiti`; and RTDB rules now include `storyReactions` and `storyComments` paths with story-audience-aware access checks and validation. Files touched: `src/components/Stories.tsx`, `src/pages/Notifications.tsx`, `src/components/AppSidebar.tsx`, `src/components/MobileTopBar.tsx`, `src/hooks/useNavBadges.ts`, `rtdb-rules.json`, `contect.md`.
- 2026-03-12: Added sticker sending support in post/reel comments (including replies) by integrating the Giphy sticker picker into comment composers, allowing sticker-only comments, and rendering sticker preview cards inline in comment threads for both feed cards and Timepass comment modal. Files touched: `src/components/PostCard.tsx`, `src/pages/Timepass.tsx`, `contect.md`.
