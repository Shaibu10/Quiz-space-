import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signOut, 
  onAuthStateChanged, 
  signInAnonymously, 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Use initializeFirestore with long polling to bypass potential proxy issues
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Test connection with retry
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      console.log("Firestore connection successful");
      return;
    } catch (error) {
      console.warn(`Firestore connection attempt ${i + 1} failed:`, error);
      if (i === retries - 1) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firestore is offline. Please check your network or Firebase configuration.");
        }
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
testConnection();

export { 
  signOut, 
  onAuthStateChanged, 
  signInAnonymously, 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
};
