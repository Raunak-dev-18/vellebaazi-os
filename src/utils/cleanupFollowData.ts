import { getDatabase, ref, get, remove } from "firebase/database";

/**
 * Utility function to clean up self-follows and duplicate follows in Firebase
 * Run this once to clean existing bad data
 */
export async function cleanupSelfFollows() {
  const db = getDatabase();
  const usersRef = ref(db, 'users');
  const usersSnapshot = await get(usersRef);
  
  if (!usersSnapshot.exists()) {
    console.log("No users found");
    return;
  }
  
  const usersData = usersSnapshot.val();
  const userIds = Object.keys(usersData);
  
  let cleanedCount = 0;
  
  for (const userId of userIds) {
    // Check if user is following themselves
    const followingRef = ref(db, `following/${userId}/${userId}`);
    const followingSnapshot = await get(followingRef);
    
    if (followingSnapshot.exists()) {
      console.log(`Removing self-follow for user ${userId}`);
      await remove(followingRef);
      cleanedCount++;
    }
    
    // Check if user is in their own followers list
    const followersRef = ref(db, `followers/${userId}/${userId}`);
    const followersSnapshot = await get(followersRef);
    
    if (followersSnapshot.exists()) {
      console.log(`Removing self-follower for user ${userId}`);
      await remove(followersRef);
      cleanedCount++;
    }
  }
  
  console.log(`Cleanup complete! Removed ${cleanedCount} self-follow entries`);
  return cleanedCount;
}

/**
 * Remove duplicate follow entries
 */
export async function cleanupDuplicateFollows() {
  const db = getDatabase();
  const usersRef = ref(db, 'users');
  const usersSnapshot = await get(usersRef);
  
  if (!usersSnapshot.exists()) {
    console.log("No users found");
    return;
  }
  
  const usersData = usersSnapshot.val();
  const userIds = Object.keys(usersData);
  
  let cleanedCount = 0;
  
  for (const userId of userIds) {
    // Get following list
    const followingRef = ref(db, `following/${userId}`);
    const followingSnapshot = await get(followingRef);
    
    if (followingSnapshot.exists()) {
      const followingData = followingSnapshot.val();
      const followingIds = Object.keys(followingData);
      
      // Check for duplicates (same user ID appearing multiple times)
      const seen = new Set<string>();
      
      for (const followedId of followingIds) {
        if (seen.has(followedId)) {
          console.log(`Found duplicate follow: ${userId} -> ${followedId}`);
          // Keep the first one, remove duplicates
          // In Firebase, each key should be unique, so this shouldn't happen
          // but we check anyway
        }
        seen.add(followedId);
      }
    }
  }
  
  console.log(`Duplicate cleanup complete! Removed ${cleanedCount} duplicate entries`);
  return cleanedCount;
}
