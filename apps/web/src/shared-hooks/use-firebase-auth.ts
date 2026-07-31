'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  signInToFirebase,
  onFirebaseAuthStateChanged,
  isFirebaseAuthenticated,
} from '../lib/firebase';
import { GET_COG_HOST } from '@/fetch-client/helper';
import { getTransport } from '@/transport';
import { FEATURES } from '@/config/features';

// Firebase powers the appointment-queue / WhatsApp-Rx feature only. On-prem it
// is off by default (plan decision #8), so unless the feature is enabled AND a
// Firebase API key is configured, this hook stays a no-op — otherwise initializing
// Firebase with an empty key throws auth/invalid-api-key and crashes the app.
const FIREBASE_ENABLED =
  FEATURES.appointmentQueue && !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

interface UseFirebaseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  forceReAuth: () => Promise<void>;
}

export const useFirebaseAuth = (): UseFirebaseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const signInAttempted = useRef(false);
  const signInAttempts = useRef(0);
  const MAX_SIGN_IN_ATTEMPTS = 3;

  const fetchFirebaseToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await getTransport().request(`${GET_COG_HOST()}/firebase`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch Firebase token');
      }

      const response = await res.json();

      return response?.token || null;
    } catch (err) {
      console.error('Error fetching Firebase token:', err);
      return null;
    }
  }, []);

  const signIn = useCallback(async () => {
    if (!FIREBASE_ENABLED) {
      setLoading(false);
      return;
    }
    if (isFirebaseAuthenticated()) {
      setLoading(false);
      return;
    }

    if (signInAttempts.current >= MAX_SIGN_IN_ATTEMPTS) {
      setLoading(false);
      return;
    }

    signInAttempts.current += 1;
    setLoading(true);
    setError(null);

    try {
      const token = await fetchFirebaseToken();

      if (!token) {
        throw new Error('No Firebase token received');
      }

      const firebaseUser = await signInToFirebase(token);
      signInAttempts.current = 0;
      setUser(firebaseUser);
    } catch (err) {
      console.error('Firebase sign in error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign in to Firebase');
    } finally {
      setLoading(false);
    }
  }, [fetchFirebaseToken]);

  // Force re-authentication (bypasses existing auth check)
  // Use this when Firebase returns permission/auth errors
  const forceReAuth = useCallback(async () => {
    if (!FIREBASE_ENABLED) {
      return;
    }
    if (signInAttempts.current >= MAX_SIGN_IN_ATTEMPTS) {
      return;
    }

    signInAttempts.current += 1;
    setLoading(true);
    setError(null);

    try {
      const token = await fetchFirebaseToken();

      if (!token) {
        throw new Error('No Firebase token received');
      }

      const firebaseUser = await signInToFirebase(token);
      signInAttempts.current = 0;
      setUser(firebaseUser);
    } catch (err) {
      console.error('Firebase force re-auth error:', err);
      setError(err instanceof Error ? err.message : 'Failed to re-authenticate with Firebase');
    } finally {
      setLoading(false);
    }
  }, [fetchFirebaseToken]);

  // Listen to auth state changes
  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      setLoading(false);
      return;
    }
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser: User | null) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto sign-in on mount
  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      return;
    }
    if (!signInAttempted.current) {
      signInAttempted.current = true;
      signIn();
    }
  }, [signIn]);

  return {
    user,
    isAuthenticated: user !== null,
    loading,
    error,
    signIn,
    forceReAuth,
  };
};
