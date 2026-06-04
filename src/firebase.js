import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAV2a89yeoZelOeyIVLjgqhmK5lMK40k4s",
  authDomain: "dhh-emergency-app.firebaseapp.com",
  projectId: "dhh-emergency-app",
  storageBucket: "dhh-emergency-app.firebasestorage.app",
  messagingSenderId: "194426079810",
  appId: "1:194426079810:web:cfb886a356ca9197e0fbdb",
  measurementId: "G-HCP49L44FR"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);