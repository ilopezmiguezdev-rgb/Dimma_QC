import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { QCDataProvider } from '@/contexts/QCDataContext';
import LoginPage from '@/pages/LoginPage.jsx';
import Dashboard from '@/pages/Dashboard.jsx';
import EquipmentPage from '@/pages/EquipmentPage.jsx';
import EquipmentDetailPage from '@/pages/EquipmentDetailPage.jsx';
import StatisticsPage from '@/pages/StatisticsPage.jsx';
import SettingsPage from '@/pages/SettingsPage.jsx';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import LoadControlPage from '@/pages/LoadControlPage.jsx';
import ResetPasswordPage from '@/pages/ResetPasswordPage.jsx';

function App() {
  return (
    <AuthProvider>
      <QCDataProvider>
        <Router>
          <Helmet>
            <title>DIMMA QC - Lab Quality Management</title>
            <meta name="description" content="Professional system for quality control management in clinical laboratory equipment." />
          </Helmet>
          
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/equipment" element={
              <ProtectedRoute>
                <Layout>
                  <EquipmentPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/equipment/:equipmentId" element={
              <ProtectedRoute>
                <Layout>
                  <EquipmentDetailPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/load-control" element={
              <ProtectedRoute>
                <Layout>
                  <LoadControlPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/statistics" element={
              <ProtectedRoute>
                <Layout>
                  <StatisticsPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Layout>
                  <SettingsPage />
                </Layout>
              </ProtectedRoute>
            } />
            {/* Redirect legacy routes */}
            <Route path="/equipos" element={<Navigate to="/equipment" replace />} />
            <Route path="/equipos/:equipmentId" element={<Navigate to="/equipment/:equipmentId" replace />} />
            <Route path="/cargar-control" element={<Navigate to="/load-control" replace />} />
            <Route path="/estadisticas" element={<Navigate to="/statistics" replace />} />
            <Route path="/configuracion" element={<Navigate to="/settings" replace />} />
            <Route path="/configuracion/qc" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          
          <Toaster />
        </Router>
      </QCDataProvider>
    </AuthProvider>
  );
}

export default App;