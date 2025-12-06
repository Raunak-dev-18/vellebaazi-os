# Where to Find S3 Credentials in Supabase

## Visual Guide

### Step 1: Navigate to Storage Settings
```
Supabase Dashboard
└── Storage (left sidebar)
    └── Settings (top right)
```

### Step 2: Find S3 Access Keys Section
Scroll down on the Storage Settings page until you see:

```
┌─────────────────────────────────────────────┐
│  S3 Access Keys                             │
│                                             │
│  Use these credentials to connect to       │
│  Supabase Storage using S3-compatible      │
│  tools and libraries.                      │
│                                             │
│  [Generate S3 Access Keys] ← Click this    │
└─────────────────────────────────────────────┘
```

### Step 3: After Generating, You'll See:

```
┌─────────────────────────────────────────────┐
│  S3 Access Keys                             │
│                                             │
│  Access Key ID:                             │
│  abc123def456ghi789...          [Copy]      │
│                                             │
│  Secret Access Key:                         │
│  ••••••••••••••••••••••••••     [Show]      │
│  (Click Show to reveal)                     │
│                                             │
│  Endpoint:                                  │
│  https://xxxxx.supabase.co/storage/v1/s3    │
│                                             │
│  Region:                                    │
│  us-east-1                                  │
└─────────────────────────────────────────────┘
```

## What You Need to Copy

From the above section, extract these values for your `.env` file:

1. **Project Reference**: From your project URL
   - URL: `https://supabase.com/dashboard/project/abcdefghijklmnop`
   - Extract: `abcdefghijklmnop`
   - Use as: `VITE_SUPABASE_PROJECT_REF=abcdefghijklmnop`

2. **Region**: Shown in S3 settings
   - Example: `us-east-1`
   - Use as: `VITE_SUPABASE_REGION=us-east-1`

3. **Access Key ID**: Shown after generating
   - Example: `abc123def456ghi789...`
   - Use as: `VITE_SUPABASE_ACCESS_KEY_ID=abc123def456ghi789...`

4. **Secret Access Key**: Click "Show" to reveal
   - Example: `xyz789abc456def123...`
   - Use as: `VITE_SUPABASE_SECRET_ACCESS_KEY=xyz789abc456def123...`

## Complete .env Example

```env
VITE_SUPABASE_PROJECT_REF=abcdefghijklmnop
VITE_SUPABASE_REGION=us-east-1
VITE_SUPABASE_ACCESS_KEY_ID=abc123def456ghi789jkl012mno345pqr678
VITE_SUPABASE_SECRET_ACCESS_KEY=xyz789abc456def123ghi789jkl012mno345pqr678stu901vwx234
```

## Important Notes

⚠️ **Secret Access Key is shown only once!**
- Save it immediately after generation
- If you lose it, you'll need to generate new credentials

🔒 **Keep credentials secure!**
- Never commit `.env` file to git
- Don't share credentials publicly
- Add `.env` to your `.gitignore`

✅ **Verify your setup:**
- Project Reference should be 16-20 characters
- Region should match your project region
- Access Key ID is usually 40-50 characters
- Secret Access Key is usually 60-80 characters
