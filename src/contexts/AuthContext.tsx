import { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { getDatabase, ref, set, get } from 'firebase/database';
import { auth, googleProvider } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signInWithGoogle: () => Promise<{ isNewUser: boolean }>;
  saveUsername: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      // Sync user data to database if user is logged in
      if (user) {
        try {
          const db = getDatabase();
          const userRef = ref(db, `users/${user.uid}`);
          const snapshot = await get(userRef);
          
          // If user doesn't exist in database, create their record
          if (!snapshot.exists()) {
            const username = user.displayName || user.email?.split('@')[0] || 'user';
            await set(userRef, {
              username: username,
              email: user.email,
              photoURL: user.photoURL,
              createdAt: new Date().toISOString()
            });
            console.log("User data synced to database:", username);
          }
        } catch (error) {
          console.error("Error syncing user data:", error);
        }
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, username: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update profile with username
    await updateProfile(user, {
      displayName: username
    });
    
    // Save username to database
    const db = getDatabase();
    await set(ref(db, `users/${user.uid}`), {
      username: username,
      email: email,
      photoURL: user.photoURL || null,
      createdAt: new Date().toISOString()
    });
  };

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user already has a username in database
    const db = getDatabase();
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);
    
    const isNewUser = !snapshot.exists();
    
    // If user doesn't exist in database, create their record with Google data
    if (isNewUser) {
      const username = user.displayName || user.email?.split('@')[0] || 'user';
      await set(userRef, {
        username: username,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: new Date().toISOString()
      });
      
      // Update profile if displayName is not set
      if (!user.displayName) {
        await updateProfile(user, {
          displayName: username
        });
      }
    }
    
    return { isNewUser };
  };

  const saveUsername = async (username: string) => {
    if (!auth.currentUser) throw new Error("No user logged in");
    
    const user = auth.currentUser;
    
    // Update profile
    await updateProfile(user, {
      displayName: username
    });
    
    // Save to database
    const db = getDatabase();
    await set(ref(db, `users/${user.uid}`), {
      username: username,
      email: user.email,
      photoURL: user.photoURL,
      createdAt: new Date().toISOString()
    });
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, saveUsername, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
