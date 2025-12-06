# Firebase Storage Setup Instructions

## Issue
You're seeing CORS errors when trying to upload files to Firebase Storage from localhost.

## Solution

### Option 1: Configure CORS (Recommended for Production)

1. Install Google Cloud SDK if you haven't already:
   - Download from: https://cloud.google.com/sdk/docs/install

2. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   ```

3. Set your project:
   ```bash
   gcloud config set project vellebaazi
   ```

4. Apply CORS configuration:
   ```bash
   gsutil cors set cors.json gs://vellebaazi.firebasestorage.app
   ```

5. Verify CORS configuration:
   ```bash
   gsutil cors get gs://vellebaazi.firebasestorage.app
   ```

### Option 2: Use Base64 (Current Fallback - Development Only)

The app currently falls back to base64 encoding for images when Firebase Storage fails. This works but:
- ❌ Stores images directly in the database (not ideal for large files)
- ❌ Only works for images
- ✅ No CORS issues
- ✅ Works immediately in development

### Option 3: Deploy Storage Rules

1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: vellebaazi
3. Go to Storage → Rules
4. Copy the contents of `storage.rules` file
5. Click "Publish"

## Current Behavior

- **Images**: Will use base64 fallback if Storage fails (works in dev)
- **Documents**: Will show error if Storage fails (need CORS fix)

## Recommended Action

For production use, please configure CORS using Option 1 above.
