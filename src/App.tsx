import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import ConsigneePortal from './pages/ConsigneePortal';
import { listenPlatformConfig, PlatformConfig, DEFAULT_PLATFORM_CONFIG } from './lib/platformConfig';
import { getStoredTheme, applyTheme } from './lib/theme';

export default function App() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [role, setRole] = useState<'staff' | 'consignee' | null>(null);
  const [consigneeDocId, setConsigneeDocId] = useState<string | undefined>(undefined);
  const [displayName, setDisplayName] = useState<string | undefined>(undefined);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    const unsubConfig = listenPlatformConfig((newConfig) => {
      setPlatformConfig(newConfig);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // 1. Look up role in the 'users' collection using UID
          const userDocRef = doc(db, 'users', user.uid);
          let userDoc = await getDoc(userDocRef);
          let userData = userDoc.exists() ? userDoc.data() : null;

          // 2. If not found by Google UID, check if there is an existing seeded user by email
          if (!userData && user.email) {
            const normalizedEmail = user.email.toLowerCase().trim();
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', normalizedEmail));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              const matchedDoc = querySnapshot.docs[0];
              userData = matchedDoc.data();

              // Save the UID-to-Profile link in the users collection for future fast logins
              await setDoc(userDocRef, {
                uid: user.uid,
                email: normalizedEmail,
                role: userData.role,
                consigneeDocId: userData.consigneeDocId || null,
                displayName: userData.displayName || user.displayName || 'User'
              }, { merge: true });
            }
          }

          // 3. Admin / Developer automatic provisioning (mcmestateservices@gmail.com or admin@mcmestates.com)
          if (!userData && user.email) {
            const normalizedEmail = user.email.toLowerCase().trim();
            if (normalizedEmail === 'mcmestateservices@gmail.com' || normalizedEmail === 'admin@mcmestates.com') {
              userData = {
                role: 'staff',
                displayName: 'Lead Administrator (Google)',
                email: normalizedEmail
              };
              // Save profile in firestore
              await setDoc(userDocRef, {
                uid: user.uid,
                email: normalizedEmail,
                role: 'staff',
                displayName: 'Lead Administrator (Google)'
              }, { merge: true });
            }
          }

          if (userData) {
            setRole(userData.role);
            setConsigneeDocId(userData.consigneeDocId);
            setDisplayName(userData.displayName || user.displayName || user.email || 'User');
          } else {
            setRole(null);
          }
        } catch (err) {
          console.error("Error reading authenticated user profile:", err);
          setRole(null);
        }
      } else {
        setRole(null);
        setConsigneeDocId(undefined);
        setDisplayName(undefined);
      }
      setSessionLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (userRole: 'staff' | 'consignee', docId?: string, name?: string) => {
    setRole(userRole);
    setConsigneeDocId(docId);
    setDisplayName(name);
  };

  const handleLogout = () => {
    setRole(null);
    setConsigneeDocId(undefined);
    setDisplayName(undefined);
  };

  if (sessionLoading) {
    const brandName = platformConfig.branding?.appName || 'MCM Estate Services';
    return (
      <div className="min-h-screen bg-[#FBFBFA] flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-[#1A1A19] mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">Initializing {brandName} Secure Auth...</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return <Login onLoginSuccess={handleLoginSuccess} config={platformConfig} />;
  }

  if (role === 'staff') {
    return (
      <AdminDashboard 
        displayName={displayName || 'Administrator'} 
        onLogout={handleLogout} 
      />
    );
  }

  return (
    <ConsigneePortal 
      consigneeDocId={consigneeDocId || ''} 
      displayName={displayName || 'Consignor'} 
      onLogout={handleLogout} 
    />
  );
}
