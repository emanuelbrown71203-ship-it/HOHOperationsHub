import iconUrl from '../assets/icon.svg';
import { useApp } from '../lib/app';

export default function Pending() {
  const { profile, refreshProfile, signOut, session } = useApp();
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={iconUrl} alt="" width={52} height={52} />
          <div>
            <span className="auth-eyebrow">HOH Operations Hub</span>
            <h1>Waiting for approval</h1>
          </div>
        </div>
        <p>
          Thanks{profile?.full_name ? `, ${profile.full_name}` : ''}! Your account ({session?.user.email}) has been created.
          A director needs to approve it in <strong>Setup → Team</strong> before you can use the app.
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
