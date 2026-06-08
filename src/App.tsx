import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import LoginPage from "./pages/login/page.tsx";
import RegisterPage from "./pages/register/page.tsx";
import NotFound from "./pages/NotFound.tsx";
import AppLayout from "./components/app-layout.tsx";
import DashboardPage from "./pages/dashboard/page.tsx";
import ContactsPage from "./pages/contacts/page.tsx";
import CampaignsPage from "./pages/campaigns/page.tsx";
import AutomationsPage from "./pages/automations/page.tsx";
import AnalyticsPage from "./pages/analytics/page.tsx";
import AnalyticsDetailPage from "./pages/analytics/detail.tsx";
import SettingsPage from "./pages/settings/page.tsx";
import CrmListsPage from "./pages/crm/lists/page.tsx";
import CrmSegmentsPage from "./pages/crm/segments/page.tsx";
import CrmCompaniesPage from "./pages/crm/companies/page.tsx";
import CrmTemplatesPage from "./pages/crm/templates/page.tsx";
import { ComingSoonPage } from "./pages/_components/coming-soon.tsx";

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/automations" element={<AutomationsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/analytics/:id" element={<AnalyticsDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/transactional" element={<ComingSoonPage title="Transactional" />} />
            <Route path="/conversations" element={<ComingSoonPage title="Conversations" />} />
            <Route path="/commerce" element={<ComingSoonPage title="Commerce" />} />
            <Route path="/help" element={<ComingSoonPage title="Help & Support" />} />
            <Route path="/crm/lists" element={<CrmListsPage />} />
            <Route path="/crm/segments" element={<CrmSegmentsPage />} />
            <Route path="/crm/companies" element={<CrmCompaniesPage />} />
            <Route path="/crm/templates" element={<CrmTemplatesPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DefaultProviders>
  );
}
