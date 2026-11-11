import React, { useState } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { LogIn, Key, Mail, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

import { PlatformConfig } from '../lib/platformConfig';

interface LoginProps {
  onLoginSuccess: (role: 'staff' | 'consignee', consigneeDocId?: string, displayName?: string) => void;
  config?: PlatformConfig;
}

export default function Login({ onLoginSuccess, config }: LoginProps) {
  const activeConfig = config;
  const brandName = activeConfig?.branding?.appName || 'MCM Estate Services';
  const subtitle = activeConfig?.branding?.portalSubtitle || 'CONSIGNMENT AUCTION SYSTEM';

  const brandParts = brandName.split(' ');
  const firstBrandPart = brandParts[0] || '';
  const remainingBrandParts = brandParts.slice(1).join(' ') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Quick credentials list
  const quickAccounts = [
    { label: 'Admin (Staff)', email: 'admin@mcmestates.com', password: 'MCMstaff2026!', role: 'Staff' },
    { label: 'Paula Duthie (Consignee)', email: 'paula.duthie@email.com', password: 'Consignee2026!', role: 'Consignee' }
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Sign in with Auth
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = userCredential.user.uid;

      // 2. Query user role in Firestore
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        onLoginSuccess(userData.role, userData.consigneeDocId, userData.displayName);
      } else {
        // Fallback or handle cases where authentication succeeded but profile didn't exist yet
        if (email.trim() === 'admin@mcmestates.com') {
          onLoginSuccess('staff', undefined, 'Lead Administrator');
        } else {
          setError("User profile document not found in Firestore. Please ensure you ran seed.js.");
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please try again.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in your Firebase project. To enable it: Go to Firebase Console -> Authentication -> Sign-in Method tab -> Click "Add new provider" -> Select "Email/Password" -> Enable and Save.');
      } else {
        setError(err.message || 'An unexpected error occurred during sign-in.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const userEmail = (userCredential.user.email || '').toLowerCase().trim();
      const uid = userCredential.user.uid;

      // 1. Check if user exists in our Firestore users collection by UID
      const userDocRef = doc(db, 'users', uid);
      let userDoc = await getDoc(userDocRef);
      let userData = userDoc.exists() ? userDoc.data() : null;

      // 2. If not found by Google UID, check if there is an existing seeded user by email
      if (!userData && userEmail) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', userEmail));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const matchedDoc = querySnapshot.docs[0];
          userData = matchedDoc.data();

          // Link their Google account to this seeded profile permanently
          await setDoc(userDocRef, {
            uid: uid,
            email: userEmail,
            role: userData.role,
            consigneeDocId: userData.consigneeDocId || null,
            displayName: userData.displayName || userCredential.user.displayName || 'User'
          }, { merge: true });
        }
      }

      // 3. Fallback for the main administrator/developer email
      if (!userData && (userEmail === 'mcmestateservices@gmail.com' || userEmail === 'admin@mcmestates.com')) {
        userData = {
          role: 'staff',
          displayName: 'Lead Administrator (Google)',
          email: userEmail
        };
        // Save the profile in Firestore
        await setDoc(userDocRef, {
          uid: uid,
          email: userEmail,
          role: 'staff',
          displayName: 'Lead Administrator (Google)'
        }, { merge: true });
      }

      if (userData) {
        onLoginSuccess(userData.role, userData.consigneeDocId, userData.displayName);
      } else {
        // Fallback: If any Google user successfully signs in, we can let them access as Staff by default to explore
        userData = {
          role: 'staff',
          displayName: userCredential.user.displayName || 'Lead Administrator (Guest)',
          email: userEmail
        };
        await setDoc(userDocRef, {
          uid: uid,
          email: userEmail,
          role: 'staff',
          displayName: userCredential.user.displayName || 'Lead Administrator (Guest)'
        }, { merge: true });
        
        onLoginSuccess('staff', undefined, userData.displayName);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during Google sign-in.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (selectedEmail: string, selectedPass: string) => {
    const account = quickAccounts.find(a => a.email === selectedEmail);
    if (account) {
      let consigneeDocId: string | undefined = undefined;
      if (account.role.toLowerCase() === 'consignee') {
        consigneeDocId = 'consignee_paula';
      }
      onLoginSuccess(
        account.role.toLowerCase() as 'staff' | 'consignee',
        consigneeDocId,
        account.label
      );
    } else {
      setEmail(selectedEmail);
      setPassword(selectedPass);
      setError(null);
    }
  };

  return (
    <div id="login-page" className="min-h-screen bg-[#FBFBFA] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">

      {/* Decorative ambient background accents */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full filter blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-600/5 rounded-full filter blur-3xl pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        {/* Title */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1A1A19] text-amber-500 mb-4 shadow-sm"
          >
            <span className="text-xl font-bold">✦</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-sans tracking-tight text-[#1A1A19] font-medium"
          >
            {firstBrandPart} <span className="font-light text-gray-500">{remainingBrandParts}</span>
          </motion.h1>
          <p className="mt-2 text-[10px] text-gray-400 tracking-widest font-mono uppercase font-semibold">
            {subtitle}
          </p>
        </div>

        {/* Outer Form Card */}
        <motion.div 
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, type: 'spring', damping: 20 }}
          className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
        >
          <div className="bg-white py-8 px-4 border-l border-r border-b border-[#E5E5E0] border-t-4 border-t-amber-500 shadow-[0_10px_30px_rgba(0,0,0,0.04)] rounded-none sm:px-10">
            <h2 className="text-lg font-medium text-gray-900 mb-6 font-sans flex items-center gap-2">
              <span>Sign in to your account</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </h2>

            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <ShieldAlert className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">
                  Email address
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-[#E5E5E0] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1A1A19] focus:border-[#1A1A19] sm:text-sm bg-[#FCFCFB]"
                    placeholder="you@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">
                  Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-[#E5E5E0] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1A1A19] focus:border-[#1A1A19] sm:text-sm bg-[#FCFCFB]"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <button
                  id="sign-in-button"
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium text-white bg-[#1A1A19] hover:bg-black focus:outline-none transition-colors duration-150 cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verifying...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <LogIn className="h-4 w-4 mr-2" />
                      Access Portal
                    </span>
                  )}
                </button>
              </div>
            </form>

            {/* Separator and Google Login Option */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#E5E5E0]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-500 uppercase tracking-wider font-sans">Or continue with</span>
                </div>
              </div>

              <div className="mt-4">
                <button
                  id="google-sign-in-button"
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center py-2.5 px-4 border border-[#E5E5E0] bg-white hover:bg-[#FBFBFA] hover:border-gray-400 text-sm font-medium text-gray-700 transition-colors duration-150 cursor-pointer"
                >
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign in with Google
                </button>
              </div>
            </div>

            {/* Quick Demo Login Section */}
            <div className="mt-8 border-t border-[#E5E5E0] pt-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center font-sans">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mr-1.5" />
                Quick Login Credentials (Seeded Demo Accounts)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quickAccounts.map((account) => (
                  <button
                    id={`quick-login-${account.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    key={account.label}
                    onClick={() => handleQuickLogin(account.email, account.password)}
                    className="flex flex-col text-left p-2.5 border border-[#E5E5E0] bg-[#FCFCFB] hover:bg-[#F3F3EF] hover:border-gray-400 transition-colors duration-150 text-xs text-gray-700"
                  >
                    <span className="font-semibold text-[#1A1A19]">{account.label}</span>
                    <span className="text-gray-400 font-mono text-[10px] truncate">{account.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
