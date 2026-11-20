import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './lib/app';
import Layout from './components/Layout';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Home from './pages/Home';
import Checklists from './pages/Checklists';
import ChecklistDetail from './pages/ChecklistDetail';
import Waste from './pages/Waste';
import Notes from './pages/Notes';
import Handoff from './pages/Handoff';
import PositionDetail from './pages/PositionDetail';
import More from './pages/More';
import Scores from './pages/Scores';
import LeadScore from './pages/LeadScore';
import Setup from './pages/Setup';
import Schedule from './pages/Schedule';
import Coaching from './pages/Coaching';
import Report from './pages/Report';
import Kitchen from './pages/Kitchen';
import Cleaning from './pages/Cleaning';
import Leaderboard from './pages/Leaderboard';
import Account from './pages/Account';
import ResetPassword from './pages/ResetPassword';

export default function App() {
  const { session, profile, loading, isAdmin, canSchedule, recovering, canViewScores } = useApp();

  if (loading) {
    return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>;
  }
  if (!session) return <Login />;
  if (recovering) return <ResetPassword />;
  if (!profile || profile.role === 'pending') return <Pending />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/checklists" element={<Checklists />} />
        <Route path="/checklists/:id" element={<ChecklistDetail />} />
        <Route path="/waste" element={<Waste />} />
        <Route path="/handoff" element={<Handoff />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/equipment" element={<Navigate to="/notes" replace />} />
        <Route path="/positions/:id" element={<PositionDetail />} />
        <Route path="/more" element={<More />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/cleaning" element={<Cleaning />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/coaching" element={canSchedule ? <Coaching /> : <Navigate to="/" replace />} />
        <Route path="/fryers" element={<Navigate to="/kitchen" replace />} />
        <Route path="/training" element={<Navigate to="/" replace />} />
        <Route path="/report" element={canSchedule ? <Report /> : <Navigate to="/" replace />} />
        <Route path="/scores" element={canViewScores ? <Scores /> : <Navigate to="/" replace />} />
        <Route path="/scores/:id" element={canViewScores ? <LeadScore /> : <Navigate to="/" replace />} />
        <Route path="/setup" element={isAdmin ? <Setup /> : <Navigate to="/" replace />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
