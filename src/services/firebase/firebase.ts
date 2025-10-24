import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

// Firebase configuration - UPDATE THESE VALUES WITH YOUR FIREBASE PROJECT CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDssOtYO32EDlHR6gLw6WguUblmBDll9gI",
  authDomain: "leveluptrades-46ac9.firebaseapp.com",
  projectId: "leveluptrades-46ac9",
  storageBucket: "leveluptrades-46ac9.firebasestorage.app",
  messagingSenderId: "248858617937",
  appId: "1:248858617937:web:c2dcde28e79aaa4b8b7070",
  measurementId: "G-C0MGY94WCZ",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Storage
export const storage = getStorage(app);

export default app;
