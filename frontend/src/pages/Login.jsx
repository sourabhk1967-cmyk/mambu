import { useEffect, useState } from 'react';

import kyroviaLogo from '../assets/kyrovia-logo.png';
import { signInWithGoogle } from '../services/firebaseAuth';
import styles from './Login.module.css';

function googleErrorMessage(error) {
  if (error?.code === 'auth/popup-closed-by-user') {
    return 'Google sign-in was closed before it finished. Try again and complete the Google page that opens.';
  }

  if (error?.code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google sign-in window. Allow popups and try again.';
  }

  if (error?.code === 'auth/redirect-cancelled-by-user') {
    return 'Google sign-in was cancelled before it finished. Try again and choose your Google account.';
  }

  if (error?.code === 'auth/unauthorized-domain') {
    return `Google sign-in is not authorized for ${window.location.hostname}. Refresh the page and try again after the Kyrovia share tunnel has finished starting.`;
  }

  if (error?.code === 'auth/operation-not-allowed') {
    return 'Google sign-in is not enabled for this Firebase project.';
  }

  if (error?.code === 'auth/network-request-failed') {
    return 'Google sign-in could not reach Firebase. Check your connection and try again.';
  }

  return error?.message || 'Google sign-in could not be completed.';
}

function Login({ initialError = '', onGoogleLogin }) {
  const [error, setError] = useState(initialError);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  async function handleGoogleSignIn() {
    if (googleLoading) {
      return;
    }

    setError('');
    setGoogleLoading(true);

    try {
      const idToken = await signInWithGoogle();

      if (!idToken) {
        return;
      }

      await onGoogleLogin(idToken);
    } catch (googleError) {
      setError(googleErrorMessage(googleError));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.brand}>
          <div className={styles.mark} aria-hidden="true">
            <img alt="" src={kyroviaLogo} />
          </div>
          <p className={styles.brandName}>Kyrovia</p>
        </div>

        <div className={styles.headingGroup}>
          <p className={styles.eyebrow}>Welcome back</p>
          <h1 id="login-title">Sign in to Kyrovia</h1>
          <p className={styles.signInCopy}>Continue with Google to enter your workspace.</p>
        </div>

        <button
          className={styles.googleButton}
          disabled={googleLoading}
          onClick={handleGoogleSignIn}
          type="button"
        >
          <svg aria-hidden="true" className={styles.googleIcon} viewBox="0 0 24 24">
            <path d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" fill="#4285F4" />
            <path d="M12 22c2.7 0 4.98-.9 6.63-2.38l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z" fill="#34A853" />
            <path d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.52l3.35-2.6Z" fill="#FBBC05" />
            <path d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.35 2.6C7.18 7.71 9.39 5.95 12 5.95Z" fill="#EA4335" />
          </svg>
          {googleLoading ? 'Signing in...' : 'Continue with Google'}
        </button>

        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}

export default Login;
