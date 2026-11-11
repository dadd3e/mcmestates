/**
 * MCM Estate Services - Firebase Seeding Script
 * 
 * This script initializes and populates your Firebase project with initial baseline data:
 * - Admin staff account (admin@mcmestates.com)
 * - 1 Consignee record (Paula Duthie)
 * - Firebase Auth users & Firestore 'users' linking documents
 */

const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

// Configure Firebase Admin
let serviceAccountPath = path.join(__dirname, 'service-account.json');
let credential = applicationDefault();

if (fs.existsSync(serviceAccountPath)) {
  console.log('Found service-account.json. Using local key...');
  const serviceAccount = require(serviceAccountPath);
  credential = cert(serviceAccount);
} else {
  console.log('No service-account.json found. Falling back to default application credentials.');
}

const firebaseConfig = require('./firebase-applet-config.json');

const app = initializeApp({
  credential: credential
});

const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
const auth = getAuth(app);

// Staff accounts - Admin only
const staffAccounts = [
  {
    uid: 'staff_admin',
    email: 'admin@mcmestates.com',
    password: 'MCMstaff2026!',
    displayName: 'Lead Administrator',
    role: 'staff'
  }
];

// Consignee accounts - Paula Duthie only
const consigneeAccounts = [
  {
    docId: 'consignee_paula',
    consigneeId: 'CON-001',
    firstName: 'Paula',
    lastName: 'Duthie',
    displayName: 'Paula Duthie',
    email: 'paula.duthie@email.com',
    password: 'Consignee2026!',
    phonePrimary: '312-555-0198',
    phoneSecondary: '',
    preferredContactMethod: 'Email',
    streetAddress1: '742 Evergreen Terrace',
    streetAddress2: '',
    city: 'Chicago',
    state: 'IL',
    postalCode: '60611',
    country: 'USA',
    accountStatus: 'Active',
    accountCreatedDate: '2026-01-15T09:00:00Z',
    lastActivityDate: new Date().toISOString(),
    referredBy: 'Direct Registration',
    referralSource: 'Website',
    internalNotes: 'Primary active consignee for MCM Estate Services.',
    paymentMethod: 'ACH',
    bankName: 'Chase Bank',
    bankAccountLast4: '5678',
    bankRoutingLast4: '1234',
    paypalHandle: '',
    commissionRate: 15,
    minimumReservePolicy: 'No reserve under $100',
    taxExempt: false,
    taxIdLast4: '',
    w9OnFile: true,
    w9DateReceived: '2026-01-16',
    lifetimeGrossSales: 0.00,
    lifetimePayouts: 0.00,
    outstandingBalance: 0.00,
    preferredAuctionFrequency: 'Monthly',
    lotMinimumValueThreshold: 50,
    preferredCategories: ['Furniture', 'Decor'],
    acceptsUnsoldReturns: true,
    unsoldDisposalPreference: 'Return',
    buyersPremiumWaiver: false,
    photoAuthorization: true,
    signedAgreement: true,
    agreementDateSigned: '2026-01-15',
    agreementVersion: 'v2026.1',
    pickupAddress: '742 Evergreen Terrace, Chicago, IL',
    pickupAvailabilityNotes: 'Flexible weekdays',
    deliveryPreference: 'Client Delivery',
    storageLocation: 'Row A-1',
    portalAccessEnabled: true,
    portalLoginEmail: 'paula.duthie@email.com'
  }
];

const auctions = [];
const lots = [];

async function seed() {
  console.log('--- Starting Seeding Process for MCM Estate Services ---');

  try {
    // 1. Create Staff & Consignee Accounts in Firebase Auth
    console.log('\nCreating/Updating Firebase Authentication Users...');
    
    // Seed staff
    for (const staff of staffAccounts) {
      try {
        await auth.createUser({
          uid: staff.uid,
          email: staff.email,
          password: staff.password,
          displayName: staff.displayName
        });
        console.log(`Auth User Created: ${staff.email} (${staff.role})`);
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          try {
            await auth.updateUser(staff.uid, {
              password: staff.password,
              displayName: staff.displayName
            });
            console.log(`Auth User Updated (already existed): ${staff.email}`);
          } catch (innerErr) {
            console.warn(`Could not update Auth user: ${staff.email}`);
          }
        } else {
          console.warn(`Could not create Auth user: ${staff.email}. Skipping Auth user creation, but will seed Firestore profile.`);
        }
      }

      // Add to Firestore 'users' collection
      try {
        await db.collection('users').doc(staff.uid).set({
          uid: staff.uid,
          email: staff.email,
          role: staff.role,
          displayName: staff.displayName
        }, { merge: true });
        console.log(`Firestore User Profile written: ${staff.uid} (${staff.email})`);
      } catch (fsErr) {
        console.error(`Failed to write staff user to Firestore:`, fsErr);
      }
    }

    // Seed consignees
    for (const c of consigneeAccounts) {
      const authUid = `auth_${c.docId}`;
      try {
        await auth.createUser({
          uid: authUid,
          email: c.email,
          password: c.password,
          displayName: c.displayName
        });
        console.log(`Auth User Created: ${c.email} (consignee)`);
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          try {
            await auth.updateUser(authUid, {
              password: c.password,
              displayName: c.displayName
            });
            console.log(`Auth User Updated (already existed): ${c.email}`);
          } catch (innerErr) {
            console.warn(`Could not update Auth user: ${c.email}`);
          }
        } else {
          console.warn(`Could not create Auth user: ${c.email}. Skipping Auth user creation, but will seed Firestore profile.`);
        }
      }

      // Add/Update in Firestore 'users' collection
      try {
        await db.collection('users').doc(authUid).set({
          uid: authUid,
          email: c.email,
          role: 'consignee',
          consigneeDocId: c.docId,
          displayName: c.displayName
        }, { merge: true });
        console.log(`Firestore User Profile written: ${authUid} (${c.email})`);
      } catch (fsErr) {
        console.error(`Failed to write consignee user to Firestore:`, fsErr);
      }
    }

    // 2. Seed 'consignees' Collection
    console.log('\nPopulating Firestore "consignees" collection...');
    for (const c of consigneeAccounts) {
      const docData = { ...c };
      delete docData.password;
      delete docData.docId;

      await db.collection('consignees').doc(c.docId).set(docData, { merge: true });
      console.log(`Consignee Doc written: ${c.docId} (${c.consigneeId})`);
    }

    console.log('\n======================================================');
    console.log('SUCCESS: All seed data updated cleanly!');
    console.log('======================================================');

  } catch (error) {
    console.error('CRITICAL ERROR during seeding process:', error);
  } finally {
    process.exit(0);
  }
}

seed();
