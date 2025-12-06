# Supabase S3 Storage Setup Guide

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - Project name: `vellebaazi` (or any name)
   - Database password: (create a strong password)
   - Region: Choose closest to your users (e.g., us-east-1, ap-southeast-1)
5. Click "Create new project"
6. **Note your Project Reference ID** (shown in project URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`)

## Step 2: Create Storage Bucket

1. In your Supabase dashboard, go to **Storage** (left sidebar)
2. Click "Create a new bucket"
3. Bucket name: `posts`
4. Make it **Public** (check the public checkbox)
5. Click "Create bucket"

## Step 3: Generate S3 Access Keys (IMPORTANT!)

1. Go to **Storage** → **Settings** (or directly: `/dashboard/project/_/storage/settings`)
2. Scroll down to **S3 Access Keys** section
3. Click **"Generate S3 Access Keys"**
4. Copy and save these credentials:
   - **Access Key ID** (starts with something like `abc123...`)
   - **Secret Access Key** (long string, shown only once!)
   - **Endpoint** (looks like: `https://xxxxx.supabase.co/storage/v1/s3`)
   - **Region** (e.g., `us-east-1`)

⚠️ **IMPORTANT**: Save the Secret Access Key immediately - you won't be able to see it again!

## Step 3: Set Bucket Policies (Important!)

1. Click on the `posts` bucket
2. Go to "Policies" tab
3. Click "New Policy"
4. Create these policies:

### Policy 1: Allow Public Read
- Policy name: `Public read access`
- Allowed operation: `SELECT`
- Target roles: `public`
- USING expression: `true`

### Policy 2: Allow Authenticated Upload
- Policy name: `Authenticated users can upload`
- Allowed operation: `INSERT`
- Target roles: `authenticated`
- USING expression: `true`

### Policy 3: Allow Users to Delete Their Own Files
- Policy name: `Users can delete own files`
- Allowed operation: `DELETE`
- Target roles: `authenticated`
- USING expression: `auth.uid()::text = (storage.foldername(name))[1]`

## Step 4: Add Credentials to Your Project

1. Create a `.env` file in your project root (if it doesn't exist)
2. Add these lines with your actual values from Step 3:

```env
# Your project reference (from project URL)
VITE_SUPABASE_PROJECT_REF=abcdefghijklmnop

# Region (from S3 settings)
VITE_SUPABASE_REGION=us-east-1

# Access Key ID (from S3 settings)
VITE_SUPABASE_ACCESS_KEY_ID=your_access_key_id_here

# Secret Access Key (from S3 settings)
VITE_SUPABASE_SECRET_ACCESS_KEY=your_secret_access_key_here
```

3. Replace all values with your actual credentials from Step 3

## Step 5: Restart Your Dev Server

```bash
npm run dev
```

## Done! 🎉

Now you can upload images and videos up to 50MB using Supabase S3 without any CORS issues!

## Benefits

- ✅ No CORS issues
- ✅ Supports large files (up to 50MB)
- ✅ Fast CDN delivery
- ✅ Free tier: 1GB storage
- ✅ Videos supported
- ✅ Public URLs for easy sharing

## Troubleshooting

### "Invalid credentials" error
- Make sure you copied the **Access Key ID** and **Secret Access Key** correctly
- Check that your .env file has the correct variable names (VITE_ prefix)
- Verify the credentials are from the S3 Access Keys section, not API keys

### "Bucket not found" error
- Make sure the bucket name is exactly `posts`
- Check that the bucket is set to **Public**

### "Permission denied" error
- Check your bucket policies (Step 3)
- Make sure the bucket is public
