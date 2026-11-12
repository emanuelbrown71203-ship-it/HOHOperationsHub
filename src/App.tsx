import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './lib/app';
import Layout from './components/Layout';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Home from './pages/Home';
import Checklists from './pages/Checklists';
import ChecklistDetail from './pages/ChecklistDetail';
import Waste from './pages/Waste';
import EquipmentPage from './pages/Equipment';
import Setup from './pages/Setup';
import Account from './pages/Account';

export default function App() {
  const { session, profile, loading, isManager } = useApp();

  if (loading) {
    return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>;
  }
  if (!session) return <Login />;
  if (!profile || profile.role === 'pending') return <Pending />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/checklists" element={<Checklists />} />
        <Route path="/checklists/:id" element={<ChecklistDetail />} />
        <Route path="/waste" element={<Waste />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/setup" element={isManager ? <Setup /> : <Navigate to="/" replace />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
