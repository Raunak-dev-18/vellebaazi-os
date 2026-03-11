import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA7FtEMGs69xzvvs6L5VWMLiHpwNfQnmD0",
  authDomain: "vellebaazi.firebaseapp.com",
  databaseURL: "https://vellebaazi-default-rtdb.firebaseio.com",
  projectId: "vellebaazi",
  storageBucket: "vellebaazi.firebasestorage.app",
  messagingSenderId: "193001828030",
  appId: "1:193001828030:web:10eba57000f45b90a838ef"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
