import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import RequestForm from './pages/RequestForm';
import RequestDetail from './pages/RequestDetail';
import Approvals from './pages/Approvals';
import Workflows from './pages/Workflows';
import RequestTypes from './pages/RequestTypes';
import Users from './pages/Users';
import Reports from './pages/Reports';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="requests" element={<Requests />} />
          <Route path="requests/new" element={<RequestForm />} />
          <Route path="requests/:id" element={<RequestDetail />} />
          <Route path="requests/:id/edit" element={<RequestForm />} />
          <Route element={<ProtectedRoute roles={['Approver', 'Super Admin']} />}>
            <Route path="approvals" element={<Approvals />} />
          </Route>
          <Route element={<ProtectedRoute roles={['Super Admin']} />}>
            <Route path="workflows" element={<Workflows />} />
            <Route path="request-types" element={<RequestTypes />} />
            <Route path="users" element={<Users />} />
            <Route path="reports" element={<Reports />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
