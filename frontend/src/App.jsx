import { Suspense, lazy, useEffect, useMemo, useState } from 'react';

import Login from './pages/Login';
import {
  completeGoogleRedirectSignIn,
  restoreGoogleSession,
  signOutGoogle
} from './services/firebaseAuth';
import {
  ApiError,
  getStoredUser,
  getStoredToken,
  loginWithFirebaseIdToken,
  logout as clearSession,
  me,
  setStoredUser,
  setStoredToken
} from './services/api';

const Chat = lazy(() => import('./pages/Chat'));
const SearchPage = lazy(() => import('./pages/SearchPage'));

function LoadingScreen({ label = 'Loading' }) {
  return (
    <main className="appCenter">
      <div className="loader" aria-label={label} />
    </main>
  );
}

function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(() => (getStoredToken() ? getStoredUser() : null));
  const [checkingSession, setCheckingSession] = useState(true);
  const [authError, setAuthError] = useState('');
  const isSearchPage = window.location.pathname === '/search';

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        let currentToken = token;
        let current;
        await completeGoogleRedirectSignIn();
        const googleSession = await restoreGoogleSession();

        if (currentToken) {
          try {
            current = await me(currentToken);
          } catch (sessionError) {
            if (sessionError instanceof ApiError && sessionError.status === 401 && googleSession?.idToken) {
              const result = await loginWithFirebaseIdToken(googleSession.idToken);
              currentToken = result.token;
              current = result;
              setStoredToken(result.token);
              if (mounted) {
                setToken(result.token);
              }
            } else {
              throw sessionError;
            }
          }

          if (current.user?.authProvider === 'firebase-google') {
            if (!googleSession) {
              clearSession();
              if (mounted) {
                setToken(null);
                setUser(null);
              }
              return;
            }

            if (
              googleSession.uid &&
              current.user.firebaseUid &&
              googleSession.uid !== current.user.firebaseUid
            ) {
              const result = await loginWithFirebaseIdToken(googleSession.idToken);
              currentToken = result.token;
              current = result;
              setStoredToken(result.token);
              if (mounted) {
                setToken(result.token);
              }
            }
          }
        } else {
          if (!googleSession) {
            return;
          }

          const result = await loginWithFirebaseIdToken(googleSession.idToken);
          currentToken = result.token;
          current = result;
          setStoredToken(result.token);
          if (mounted) {
            setToken(result.token);
          }
        }

        if (mounted) {
          setStoredUser(current.user);
          setUser(current.user);
        }
      } catch (_error) {
        clearSession();
        if (mounted) {
          setToken(null);
          setUser(null);
          setAuthError(_error?.message || 'Google sign-in could not be completed.');
        }
      } finally {
        if (mounted) {
          setCheckingSession(false);
        }
      }
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, [token]);

  const session = useMemo(
    () => ({
      token,
      user
    }),
    [token, user]
  );

  async function handleGoogleLogin(idToken) {
    setAuthError('');
    const result = await loginWithFirebaseIdToken(idToken);
    setStoredToken(result.token);
    setStoredUser(result.user);
    setToken(result.token);
    setUser(result.user);
  }

  async function handleLogout() {
    clearSession();

    try {
      await signOutGoogle();
    } finally {
      setToken(null);
      setUser(null);
    }
  }

  if (checkingSession) {
    return <LoadingScreen label="Checking session" />;
  }

  if (!token || !user) {
    return <Login initialError={authError} onGoogleLogin={handleGoogleLogin} />;
  }

  if (isSearchPage) {
    return (
      <Suspense fallback={<LoadingScreen label="Loading search" />}>
        <SearchPage session={session} onLogout={handleLogout} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen label="Loading chat" />}>
      <Chat key={user.firebaseUid || user.username} session={session} onLogout={handleLogout} />
    </Suspense>
  );
}

export default App;
