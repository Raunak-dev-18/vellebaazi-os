# Firestore Setup Guide

## Problem
You're getting CORS errors and "ERR_FAILED 200" because Firestore is not properly configured in your Firebase project.

## Solution: Enable and Configure Firestore

### Step 1: Enable Firestore in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **vellebaazi**
3. Click **Firestore Database** in the left sidebar
4. Click **"Create database"** button

### Step 2: Choose Firestore Mode

When prompted, select:
- **Start in production mode** (we'll add rules next)
- **Location**: Choose closest to your users (e.g., `asia-south1` for India)
- Click **"Enable"**

Wait for Firestore to be created (takes 1-2 minutes)

### Step 3: Update Firestore Rules

1. In Firestore Database, go to the **"Rules"** tab
2. Replace the existing rules with this:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Posts collection
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // Likes collection
    match /likes/{likeId} {
      allow read: if true;
      allow create, delete: if request.auth != null;
    }
    
    // Comments collection
    match /comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

3. Click **"Publish"**

### Step 4: Verify Setup

1. Go to **Firestore Database** → **Data** tab
2. You should see an empty database (no collections yet)
3. Collections will be created automatically when you upload your first post

### Step 5: Test Your App

1. **Refresh your browser** (Ctrl+R or Cmd+R)
2. Go to your profile
3. Click "Create Post"
4. Upload an image
5. Add a caption
6. Click "Post"

The post should now save successfully! 🎉

## Troubleshooting

### Still getting CORS errors?
- Make sure you published the Firestore rules
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)

### "Permission denied" error?
- Check that you're logged in
- Verify Firestore rules are published
- Make sure the rules match exactly as shown above

### Posts not showing?
- Check Firestore Database → Data tab
- You should see `posts`, `likes`, and `comments` collections
- If empty, try uploading a post again

## What These Rules Do

- **Posts**: Anyone can read, only authenticated users can create, only owners can edit/delete
- **Likes**: Anyone can read, only authenticated users can like/unlike
- **Comments**: Anyone can read, only authenticated users can comment, only owners can delete their comments

## Important Notes

⚠️ **These rules allow public read access** - This is intentional for a social media app where posts should be visible to everyone.

🔒 **Write access is protected** - Only authenticated users can create content, and only owners can modify/delete their own content.
