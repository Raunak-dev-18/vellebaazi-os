import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-zA-Z0-9._]+$/,
    "Username can only contain letters, numbers, dots and underscores",
  );

export const groupNameSchema = z
  .string()
  .trim()
  .min(3, "Group name must be at least 3 characters")
  .max(60, "Group name must be at most 60 characters");

export const chatMessageSchema = z
  .string()
  .trim()
  .max(2000, "Message is too long");

export const parseUsername = (value: string) => usernameSchema.safeParse(value);
export const parseGroupName = (value: string) => groupNameSchema.safeParse(value);
export const parseChatMessage = (value: string) =>
  chatMessageSchema.safeParse(value);

