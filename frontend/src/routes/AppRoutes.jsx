import { Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { LoginPage } from '../pages/auth/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { DirectoryPage } from '../pages/directory/DirectoryPage';
import { DoctorFichaPage } from '../pages/directory/DoctorFichaPage';
import { DoctorHistoryPage } from '../pages/directory/DoctorHistoryPage';
import { BranchFichaPage } from '../pages/directory/BranchFichaPage';
import { BranchHistoryPage } from '../pages/directory/BranchHistoryPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { InventoryPage } from '../pages/inventory/InventoryPage';
import { InventorySampleDetailPage } from '../pages/inventory/InventorySampleDetailPage';
import { MultimediaPage } from '../pages/multimedia/MultimediaPage';
import { VisitsPage } from '../pages/visits/VisitsPage';
import { VisitExecutionPage } from '../pages/visitExecution/VisitExecutionPage';
import { VisitDetailPage } from '../pages/visitExecution/VisitDetailPage';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index element={<Navigate to="/directorio" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/directorio" element={<DirectoryPage />} />
          <Route path="/directorio/ficha/:codigoMedico" element={<DoctorFichaPage />} />
          <Route path="/directorio/historial/:codigoMedico" element={<DoctorHistoryPage />} />
          <Route path="/directorio/sucursales/ficha/:codigoSucursal" element={<BranchFichaPage />} />
          <Route path="/directorio/sucursales/historial/:codigoSucursal" element={<BranchHistoryPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/inventario/detalle/:codigoProducto" element={<InventorySampleDetailPage />} />
          <Route path="/multimedia" element={<MultimediaPage />} />
          <Route path="/visitas" element={<VisitsPage />} />
          <Route path="/visita-ejecucion/:visitId" element={<VisitExecutionPage />} />
          <Route path="/visita-detalle/:visitId" element={<VisitDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/directorio" replace />} />
    </Routes>
  );
}

export default AppRoutes;
