import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound, Boxes, Activity, PackageCheck } from 'lucide-react';
import './orevon-login.css';

type LoginHandler = (username: string, password: string) => Promise<void> | void;

export interface OrevonLoginPanelProps {
  /** Pass your existing AuthContext login function here. Do not request JWTs inside the UI component. */
  onLogin: LoginHandler;
  /** Server error supplied by the existing authentication layer. */
  error?: string | null;
  /** True while the existing authentication layer is making a request. */
  isSubmitting?: boolean;
}

/** UI-only login form. Does not store passwords or tokens, call APIs, or control routing. */
export default function OrevonLoginPanel({
  onLogin,
  error,
  isSubmitting = false,
}: OrevonLoginPanelProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const busy = isSubmitting || pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const user = username.trim();
    if (!user || !password) {
      setLocalError('Enter your username and password.');
      return;
    }
    setLocalError('');
    setPending(true);
    try {
      await onLogin(user, password);
    } catch {
      // The callback may already expose a more specific message through `error`.
      setLocalError('Sign-in was unsuccessful. Check your details and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="orevon-auth-root">
      <section className="orevon-auth-story" aria-label="Orevon overview">
        <div className="orevon-auth-story-inner">
          <div className="orevon-auth-brand"><span className="orevon-auth-logo" aria-hidden="true"><Boxes size={25} strokeWidth={2.2} /></span><span>OREVON <small>SMART OPERATIONS</small></span></div>
          <div className="orevon-auth-intro">
            <span className="orevon-auth-eyebrow"><span className="orevon-auth-pulse" /> ONE CONNECTED WORKSPACE</span>
            <h1>Control today.<br /><em>Grow tomorrow.</em></h1>
            <p>Products, inventory, orders, and operations — together in one reliable workspace.</p>
          </div>
          <div className="orevon-auth-feature-grid" aria-label="Platform capabilities">
            <div className="orevon-auth-feature"><PackageCheck size={20} /><span>Inventory visibility<strong>Know what’s in stock</strong></span></div>
            <div className="orevon-auth-feature"><Activity size={20} /><span>Operational clarity<strong>Move with confidence</strong></span></div>
          </div>
          <p className="orevon-auth-story-bottom">Built for focused, efficient teams.</p>
        </div>
      </section>
      <section className="orevon-auth-form-area">
        <div className="orevon-auth-mobile-brand"><span className="orevon-auth-logo" aria-hidden="true"><Boxes size={22} /></span><strong>OREVON</strong></div>
        <div className="orevon-auth-card">
          <span className="orevon-auth-kicker"><ShieldCheck size={15} /> TEAM ACCESS</span>
          <h2>Welcome back</h2>
          <p className="orevon-auth-subtitle">Sign in to continue to your workspace.</p>
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="orevon-username">Username</label>
            <div className="orevon-auth-field"><UserRound size={19} aria-hidden="true" /><input id="orevon-username" autoComplete="username" name="username" placeholder="Enter your username" value={username} maxLength={150} onChange={(e) => { setUsername(e.target.value); setLocalError(''); }} disabled={busy} required /></div>
            <label htmlFor="orevon-password">Password</label>
            <div className="orevon-auth-field"><LockKeyhole size={19} aria-hidden="true" /><input id="orevon-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" name="password" placeholder="Enter your password" value={password} onChange={(e) => { setPassword(e.target.value); setLocalError(''); }} disabled={busy} required /><button className="orevon-auth-eye" type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={busy}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {(error || localError) && <div className="orevon-auth-error" role="alert">{error || localError}</div>}
            <button className="orevon-auth-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Signing in…' : 'Sign in to Orevon'}<ArrowRight size={19} aria-hidden="true" /></button>
          </form>
          <div className="orevon-auth-footnote"><ShieldCheck size={15} aria-hidden="true" /> Access is managed by your organization.</div>
        </div>
        <div className="orevon-auth-bottom">OREVON <span>·</span> Inventory & Order Management</div>
      </section>
    </main>
  );
}
