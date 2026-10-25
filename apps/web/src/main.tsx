import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Shell } from './components/Shell';
import { Network } from './pages/Network';
import { Agent } from './pages/Agent';
import { Workspace } from './pages/Workspace';
import { Merchant } from './pages/Merchant';
import { Agents } from './pages/Agents';
import { AgentManage } from './pages/AgentManage';
import { Team } from './pages/Team';
import { Integrations } from './pages/Integrations';
import { Issuer } from './pages/Issuer';
import { SignIn } from './pages/SignIn';
import { Access } from './pages/Access';
import { AgentSettings } from './pages/AgentSettings';
import { getSession, HOME } from './session';

// Light mode everywhere, like the Fluxyn app
document.documentElement.dataset.theme = 'light';

function Private({ children }: { children: ReactNode }) {
  return getSession() ? <Shell>{children}</Shell> : <Navigate to="/signin" replace />;
}

function Home() {
  const s = getSession();
  if (!s) return <Navigate to="/signin" replace />;
  return s.role === 'network' ? <Shell><Network /></Shell> : <Navigate to={HOME[s.role]} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/" element={<Home />} />
        <Route path="/agents" element={<Private><Agents /></Private>} />
        <Route path="/agents/:address" element={<Private><Agent /></Private>} />
        <Route path="/agents/:agentKey/train" element={<Private><AgentSettings /></Private>} />
        <Route path="/agents/:agentKey/manage" element={<Private><AgentManage /></Private>} />
        <Route path="/team" element={<Private><Team /></Private>} />
        <Route path="/integrations" element={<Private><Integrations /></Private>} />
        <Route path="/workspace" element={<Private><Workspace /></Private>} />
        <Route path="/merchant" element={<Private><Merchant /></Private>} />
        <Route path="/issuer" element={<Private><Issuer /></Private>} />
        <Route path="/access" element={<Private><Access /></Private>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
