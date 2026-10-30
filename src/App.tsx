import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AppLayout from "./components/app-layout.tsx";
import { ComingSoonPage } from "./pages/_components/coming-soon.tsx";

const AuthCallback = lazy(() => import("./pages/auth/Callback.tsx"));
const LoginPage = lazy(() => import("./pages/login/page.tsx"));
const RegisterPage = lazy(() => import("./pages/register/page.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const DashboardPage = lazy(() => import("./pages/dashboard/page.tsx"));
const ContactsPage = lazy(() => import("./pages/contacts/page.tsx"));
const CampaignsPage = lazy(() => import("./pages/campaigns/page.tsx"));
const AutomationsPage = lazy(() => import("./pages/automations/page.tsx"));
const AnalyticsPage = lazy(() => import("./pages/analytics/page.tsx"));
const AnalyticsDetailPage = lazy(() => import("./pages/analytics/detail.tsx"));
const SettingsPage = lazy(() => import("./pages/settings/page.tsx"));
const CrmListsPage = lazy(() => import("./pages/crm/lists/page.tsx"));
const CrmSegmentsPage = lazy(() => import("./pages/crm/segments/page.tsx"));
const CrmCompaniesPage = lazy(() => import("./pages/crm/companies/page.tsx"));
const CrmTemplatesPage = lazy(() => import("./pages/crm/templates/page.tsx"));
const GetStartedPage = lazy(() => import("./pages/get-started/page.tsx"));

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Suspense fallback={null}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/get-started" element={<GetStartedPage />} />
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
        </Suspense>
      </BrowserRouter>
    </DefaultProviders>
  );
}
