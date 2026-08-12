import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const hasValidConfig =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'YOUR_API_KEY_HERE';

const app = hasValidConfig ? initializeApp(firebaseConfig) : null;
export const db =
  app && firebaseConfig.firestoreDatabaseId && hasValidConfig
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : null;
export const auth = app && hasValidConfig ? getAuth(app) : null;
