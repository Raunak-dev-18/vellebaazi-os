import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Supabase S3 Configuration for Posts
const supabaseProjectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF || 'YOUR_PROJECT_REF';
const supabaseRegion = import.meta.env.VITE_SUPABASE_REGION || 'YOUR_REGION';
const supabaseAccessKeyId = import.meta.env.VITE_SUPABASE_ACCESS_KEY_ID || 'YOUR_ACCESS_KEY_ID';
const supabaseSecretAccessKey = import.meta.env.VITE_SUPABASE_SECRET_ACCESS_KEY || 'YOUR_SECRET_ACCESS_KEY';

// Supabase S3 Configuration for Chat
const chatSupabaseProjectRef = import.meta.env.VITE_CHAT_SUPABASE_PROJECT_REF || 'YOUR_CHAT_PROJECT_REF';
const chatSupabaseRegion = import.meta.env.VITE_CHAT_SUPABASE_REGION || 'YOUR_CHAT_REGION';
const chatSupabaseAccessKeyId = import.meta.env.VITE_CHAT_SUPABASE_ACCESS_KEY_ID || 'YOUR_CHAT_ACCESS_KEY_ID';
const chatSupabaseSecretAccessKey = import.meta.env.VITE_CHAT_SUPABASE_SECRET_ACCESS_KEY || 'YOUR_CHAT_SECRET_ACCESS_KEY';

// S3 endpoint for Supabase - use storage subdomain
const s3Endpoint = `https://${supabaseProjectRef}.storage.supabase.co/storage/v1/s3`;
const chatS3Endpoint = `https://${chatSupabaseProjectRef}.storage.supabase.co/storage/v1/s3`;

// Create S3 Client for Posts
export const s3Client = new S3Client({
  region: supabaseRegion,
  endpoint: s3Endpoint,
  credentials: {
    accessKeyId: supabaseAccessKeyId,
    secretAccessKey: supabaseSecretAccessKey,
  },
  forcePathStyle: true,
});

// Create S3 Client for Chat
export const chatS3Client = new S3Client({
  region: chatSupabaseRegion,
  endpoint: chatS3Endpoint,
  credentials: {
    accessKeyId: chatSupabaseAccessKeyId,
    secretAccessKey: chatSupabaseSecretAccessKey,
  },
  forcePathStyle: true,
});

// Storage bucket names
export const POSTS_BUCKET = 'vellebaazi';
export const CHAT_BUCKET = 'chat_vellebaazi';

// Helper function to get public URL for posts
export const getPublicUrl = (fileName: string) => {
  return `https://${supabaseProjectRef}.storage.supabase.co/storage/v1/object/public/${POSTS_BUCKET}/${fileName}`;
};

// Helper function to get public URL for chat files
export const getChatPublicUrl = (fileName: string) => {
  return `https://${chatSupabaseProjectRef}.storage.supabase.co/storage/v1/object/public/${CHAT_BUCKET}/${fileName}`;
};

// Helper function to upload file
export const uploadToS3 = async (file: File, fileName: string) => {
  // Convert File to ArrayBuffer for AWS SDK
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  const command = new PutObjectCommand({
    Bucket: POSTS_BUCKET,
    Key: fileName,
    Body: uint8Array,
    ContentType: file.type,
    CacheControl: 'max-age=3600',
  });

  await s3Client.send(command);
  return getPublicUrl(fileName);
};

// Helper function to delete file from posts bucket
export const deleteFromS3 = async (fileName: string) => {
  const command = new DeleteObjectCommand({
    Bucket: POSTS_BUCKET,
    Key: fileName,
  });

  await s3Client.send(command);
};

// Helper function to upload file to chat bucket
export const uploadToChatS3 = async (file: File, fileName: string) => {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  const command = new PutObjectCommand({
    Bucket: CHAT_BUCKET,
    Key: fileName,
    Body: uint8Array,
    ContentType: file.type,
    CacheControl: 'max-age=3600',
  });

  await chatS3Client.send(command);
  return getChatPublicUrl(fileName);
};

// Helper function to delete file from chat bucket
export const deleteFromChatS3 = async (fileName: string) => {
  const command = new DeleteObjectCommand({
    Bucket: CHAT_BUCKET,
    Key: fileName,
  });

  await chatS3Client.send(command);
};
