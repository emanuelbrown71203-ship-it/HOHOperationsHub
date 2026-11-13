import iconUrl from '../assets/icon.svg';
import { useApp } from '../lib/app';
import { PasswordForm } from './Account';

export default function ResetPassword() {
  const { finishRecovery } = useApp();
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={iconUrl} alt="" width={52} height={52} />
          <div>
            <span className="auth-eyebrow">HOH Operations Hub</span>
            <h1>Set a new password</h1>
          </div>
        </div>
        <PasswordForm title="Choose your new password" onDone={finishRecovery} />
      </div>
    </div>
  );
}
