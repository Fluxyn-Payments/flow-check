import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Shell } from './components/Shell';
import { Network } from './pages/Network';
import { Agent } from './pages/Agent';
import { Workspace } from './pages/Workspace';
import { Merchant } from './pages/Merchant';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Network />} />
          <Route path="/agents/:address" element={<Agent />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/merchant" element={<Merchant />} />
          <Route path="*" element={<Network />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </StrictMode>,
);
