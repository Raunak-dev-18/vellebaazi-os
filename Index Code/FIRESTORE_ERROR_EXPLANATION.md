# Why Your Posts Are Not Showing

## The Problem

Your posts show "0 posts" because **Firestore Database is NOT enabled** in your Firebase project.

## What's Happening:

1. ✅ **Image Upload Works** - Images are uploading to Supabase Storage successfully
2. ❌ **Post Data Fails** - Post metadata (caption, likes, etc.) fails to save to Firestore
3. ❌ **Fetch Fails** - When trying to load posts, Firestore returns an error

## The Evidence:

Looking at your screenshots:
- Both profiles show **"0 posts"**
- The post count never increases
- Posts don't appear on profile or home page
- But you can see the upload dialog worked

## Why This Happens:

When you try to save a post, this code runs:

```javascript
await addDoc(collection(firestore, 'posts'), {
  userId: user.uid,
  username: user.displayName,
  mediaUrl: imageUrl,
  caption: caption,
  // ... other data
});
```

But since Firestore is not enabled, this fails silently (or with CORS errors you saw earlier).

## The Solution (5 Minutes):

### Step 1: Go to Firebase Console
https://console.firebase.google.com/project/vellebaazi/firestore

### Step 2: You'll See One of These:

**Option A: "Get started" button**
- Click it
- Choose "Start in production mode"
- Select location: "asia-south1"
- Click "Enable"

**Option B: "Create database" button**
- Click it
- Choose "Start in production mode"
- Select location: "asia-south1"
- Click "Enable"

### Step 3: Wait (1-2 minutes)
Firestore will be created. You'll see a loading screen.

### Step 4: Set Rules
Once created, go to "Rules" tab and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    match /likes/{likeId} {
      allow read: if true;
      allow create, delete: if request.auth != null;
    }
    match /comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

Click "Publish"

### Step 5: Test
1. Refresh your app
2. Upload a new post
3. It should now save and appear!

## Why You MUST Do This:

Without Firestore enabled:
- ❌ Posts won't save
- ❌ Likes won't work
- ❌ Comments won't work
- ❌ Post count stays at 0
- ❌ Home feed stays empty

With Firestore enabled:
- ✅ Posts save properly
- ✅ Likes work
- ✅ Comments work
- ✅ Post count updates
- ✅ Home feed shows posts

## This is NOT Optional

Firestore is the database where all your post data is stored. Without it, your app cannot function properly.

**Please enable Firestore now before continuing!**
