// Mocking Firebase Firestore for the MVP until real credentials are provided.
// In a production app, you would run:
// import { initializeApp } from 'firebase/app';
// import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export interface CountryDocument {
  id: string; // The ISO3 code
  title: string;
  description: string;
  mapUrl?: string;
  reportUrl?: string;
  lastUpdated: string;
}

// LocalStorage Mock Implementation
const STORAGE_KEY = 'gmw_mock_firestore';

const getMockDb = (): Record<string, CountryDocument[]> => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : {};
};

const saveMockDb = (db: Record<string, CountryDocument[]>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

export const getCountryDocuments = async (iso: string): Promise<CountryDocument[]> => {
  // Simulate network latency
  await new Promise(r => setTimeout(r, 500));
  const db = getMockDb();
  return db[iso] || [];
};

export const addCountryDocument = async (iso: string, doc: Omit<CountryDocument, 'id' | 'lastUpdated'>): Promise<CountryDocument> => {
  await new Promise(r => setTimeout(r, 500));
  const db = getMockDb();
  if (!db[iso]) db[iso] = [];
  
  const newDoc: CountryDocument = {
    ...doc,
    id: Math.random().toString(36).substr(2, 9),
    lastUpdated: new Date().toISOString()
  };
  
  db[iso].push(newDoc);
  saveMockDb(db);
  return newDoc;
};

export const deleteCountryDocument = async (iso: string, docId: string): Promise<void> => {
  await new Promise(r => setTimeout(r, 300));
  const db = getMockDb();
  if (db[iso]) {
    db[iso] = db[iso].filter(d => d.id !== docId);
    saveMockDb(db);
  }
};

export const updateCountryDocument = async (iso: string, docId: string, updates: Partial<CountryDocument>): Promise<void> => {
  await new Promise(r => setTimeout(r, 300));
  const db = getMockDb();
  if (db[iso]) {
    const index = db[iso].findIndex(d => d.id === docId);
    if (index !== -1) {
      db[iso][index] = { ...db[iso][index], ...updates, lastUpdated: new Date().toISOString() };
      saveMockDb(db);
    }
  }
};
