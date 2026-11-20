import iconUrl from '../assets/icon.svg';
import { useApp } from '../lib/app';
import { isPlaceholderEmail } from '../lib/passkeys';
import PasskeyNudge from '../components/PasskeyNudge';
import { PreviewBanner } from '../components/ViewAs';

export default function Pending() {
  const { profile, refreshProfile, signOut, session } = useApp();
  const email = session?.user.email;
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <PreviewBanner noSwitch />
        <div className="auth-brand">
          <img src={iconUrl} alt="" width={52} height={52} />
          <div>
            <span className="auth-eyebrow">HOH Operations Hub</span>
            <h1>Waiting for approval</h1>
          </div>
        </div>
        <PasskeyNudge />
        <p>
          Thanks{profile?.full_name ? `, ${profile.full_name}` : ''}! Your account{email && !isPlaceholderEmail(email) ? ` (${email})` : ''} has been created.
          An admin needs to approve it in <strong>Setup → People</strong> before you can use the app.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => refreshProfile()}>
          Check again
        </button>
        <button className="btn btn-ghost btn-block" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
