# Velle Baazi

A modern, Instagram-inspired social media platform built with React, TypeScript, and Firebase. Share posts, stories, reels, and connect with friends through real-time messaging.

![Velle Baazi](public/logo.png)

## ✨ Features

### 📱 Core Social Features
- **Feed** - View posts from users you follow with infinite scroll
- **Stories** - Share 24-hour disappearing stories with image editing capabilities
- **Timepass (Reels)** - TikTok-style vertical video feed with snap scrolling
- **Explore** - Discover public content from the community
- **Create Posts** - Multi-step post creation with image/video support (up to 50MB)

### 💬 Messaging (Bakaiti)
- Real-time 1-on-1 chat with Firebase Realtime Database
- File sharing (images, videos, documents)
- GIF support via Giphy API
- Message reactions with emojis
- Link previews
- Message forwarding and deletion
- Typing indicators
- **@cognix** - AI assistant powered by Google Gemini for in-chat help

### 👤 User Features
- Email/Password and Google OAuth authentication
- Customizable profiles with bio and avatar
- Public/Private account settings
- Follow/Unfollow system with follow requests for private accounts
- User mentions (@username) in posts and comments
- Notifications for likes, comments, follows, and mentions

### 🎨 UI/UX
- Dark/Light/System theme support
- Fully responsive design (mobile-first)
- Smooth animations and transitions
- Instagram-style gradient accents
- Skeleton loading states

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS, shadcn/ui, Radix UI |
| **State Management** | React Query, React Context |
| **Authentication** | Firebase Auth |
| **Database** | Firebase Realtime Database |
| **Storage** | Supabase S3 (AWS SDK) |
| **AI** | Google Gemini API |
| **Routing** | React Router v6 |

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── PostCard.tsx    # Post display component
│   ├── Stories.tsx     # Stories carousel
│   ├── StoryEditor.tsx # Story image editor
│   └── ...
├── contexts/
│   └── AuthContext.tsx # Authentication context
├── hooks/              # Custom React hooks
├── lib/
│   ├── firebase.ts     # Firebase configuration
│   ├── supabase.ts     # Supabase S3 storage
│   ├── ai.ts           # Gemini AI integration
│   └── utils.ts        # Utility functions
├── pages/
│   ├── Home.tsx        # Main feed
│   ├── Timepass.tsx    # Reels/short videos
│   ├── Bakaiti.tsx     # Messaging
│   ├── Profile.tsx     # User profile
│   ├── Explore.tsx     # Discover content
│   ├── Create.tsx      # Post creation
│   ├── Settings.tsx    # User settings
│   └── ...
└── App.tsx             # Main app with routing
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ or Bun
- Firebase project with Realtime Database enabled
- Supabase project with S3 storage configured
- (Optional) Google Gemini API key for AI features
- (Optional) Giphy API key for GIF support

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/vellebaazi.git
   cd vellebaazi
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Configure environment variables**
   
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   Required variables:
   ```env
   # Supabase S3 Configuration (for media storage)
   VITE_SUPABASE_PROJECT_REF=your_project_ref
   VITE_SUPABASE_REGION=your_region
   VITE_SUPABASE_ACCESS_KEY_ID=your_access_key
   VITE_SUPABASE_SECRET_ACCESS_KEY=your_secret_key

   # Optional: Google Gemini API (for @cognix AI assistant)
   VITE_GEMINI_API_KEY=your_gemini_api_key

   # Optional: Giphy API (for GIF support in chat)
   VITE_GIPHY_API_KEY=your_giphy_api_key
   ```

4. **Start the development server**
   ```bash
   npm run dev
   # or
   bun dev
   ```

5. **Open your browser**
   
   Navigate to `http://localhost:8080`

### Building for Production

```bash
npm run build
# or
bun run build
```

The built files will be in the `dist/` directory.

## 🔧 Firebase Setup

The app uses Firebase for authentication and real-time data. The Firebase config is already set up in `src/lib/firebase.ts`. If you want to use your own Firebase project:

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Authentication (Email/Password and Google providers)
3. Enable Realtime Database
4. Update the config in `src/lib/firebase.ts`

### Database Structure

```
├── users/
│   └── {userId}/
│       ├── username
│       ├── email
│       ├── photoURL
│       ├── bio
│       ├── gender
│       └── accountPrivacy
├── posts/
│   └── {postId}/
│       ├── userId
│       ├── mediaUrl
│       ├── caption
│       ├── likes
│       └── ...
├── stories/
├── messages/
├── userChats/
├── followers/
├── following/
├── notifications/
└── ...
```

## 📱 Pages Overview

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Main feed with posts from followed users |
| `/timepass` | Timepass | Vertical scrolling reels/videos |
| `/bakaiti` | Bakaiti | Direct messaging |
| `/explore` | Explore | Discover public content |
| `/create` | Create | Multi-step post/reel creation |
| `/profile` | Profile | Your profile with posts |
| `/settings` | Settings | Account and privacy settings |
| `/users/profile/:username` | User Profile | View other users' profiles |
| `/notifications` | Notifications | Activity notifications |
| `/login` | Login | Authentication page |

## 🤖 AI Assistant (@cognix)

In any chat conversation, mention `@cognix` to get AI-powered assistance. The assistant uses Google Gemini and can help with:
- Answering questions
- Providing information
- General conversation

## 📄 License

This project is open source and available und