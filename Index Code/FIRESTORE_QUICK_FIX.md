# Quick Fix: Enable Firestore

## The Problem
Your posts aren't saving because **Firestore is not enabled** in your Firebase project.

## The Solution (5 minutes)

### 1. Go to Firebase Console
https://console.firebase.google.com/project/vellebaazi/firestore

### 2. Click "Create Database"
- Choose: **Production mode**
- Location: **asia-south1** (or closest to you)
- Click **Enable**

### 3. Set Rules (After database is created)
Go to **Rules** tab and paste this:

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

Click **Publish**

### 4. Refresh Your App
- Close the upload dialog
- Refresh browser (Ctrl+R)
- Try uploading again

## Done! ✅

Your posts should now save and appear on the home page!
