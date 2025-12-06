# Quick Start - Supabase Storage Integration

## What I've Done

✅ Installed `@aws-sdk/client-s3` for S3-compatible storage
✅ Created Supabase S3 configuration file (`src/lib/supabase.ts`)
✅ Updated Profile.tsx to use Supabase S3 Storage
✅ Added support for images AND videos (up to 50MB)
✅ Created `.env.example` template with S3 credentials

## What You Need to Do

### 1. Create Supabase Account & Project
- Go to https://supabase.com
- Create a new project
- Create a bucket named `posts` (make it PUBLIC)

### 2. Generate S3 Access Keys
From Supabase Dashboard → Storage → Settings:
- Click **"Generate S3 Access Keys"**
- Copy **Access Key ID**
- Copy **Secret Access Key** (save it immediately!)
- Note your **Project Reference** and **Region**

### 3. Create `.env` File
Create a `.env` file in your project root:

```env
VITE_SUPABASE_PROJECT_REF=your-project-ref
VITE_SUPABASE_REGION=us-east-1
VITE_SUPABASE_ACCESS_KEY_ID=your-access-key-id
VITE_SUPABASE_SECRET_ACCESS_KEY=your-secret-key
```

### 4. Restart Dev Server
```bash
npm run dev
```

### 5. Test Upload
- Go to your profile
- Click "Create Post"
- Upload an image or video
- Should work without CORS errors! 🎉

## File Structure

```
src/
├── lib/
│   ├── firebase.ts          # Firebase config (existing)
│   └── supabase.ts          # Supabase config (NEW)
├── pages/
│   └── Profile.tsx          # Updated with Supabase upload
.env                          # Your credentials (CREATE THIS)
.env.example                  # Template (created)
```

## Features

- ✅ Upload images (JPG, PNG, GIF)
- ✅ Upload videos (MP4, MOV, WEBM)
- ✅ Max file size: 50MB
- ✅ No CORS issues
- ✅ Fast CDN delivery
- ✅ Public URLs stored in Firestore

## Need Help?

See `SUPABASE_SETUP.md` for detailed step-by-step instructions.
