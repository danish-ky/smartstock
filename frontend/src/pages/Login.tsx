import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth';
import OrevonLoginPanel from '../components/auth/OrevonLoginPanel';

/** Keep Orevon's existing authentication and post-login navigation unchanged. */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  async function handleLogin(username: string, password: string) {
    setError('');
    try {
      await login(username.trim(), password);
      toast.success('Welcome to Orevon');
      navigate('/');
    } catch (err) {
  setError(err instanceof Error ? err.message : 'Unable to sign in');
  throw err;
}
  }

  return <OrevonLoginPanel onLogin={handleLogin} error={error} />;
}
