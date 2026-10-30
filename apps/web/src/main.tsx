import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AuthProvider } from "./lib/auth";
import { SiteLayout } from "./site/SiteLayout";
import { StaffLayout } from "./staff/StaffLayout";
import { Spinner } from "./ui";

const Home = lazy(() => import("./site/Home"));
const Shop = lazy(() => import("./site/Shop"));
const VehiclePage = lazy(() => import("./site/VehiclePage"));
const Login = lazy(() => import("./site/Login"));
const Register = lazy(() => import("./site/Register"));
const info = () => import("./site/InfoPages");
const ContentPage = ({ slug }: { slug: string }) => {
  const C = ContentPageLazy;
  return <C slug={slug} />;
};
const ContentPageLazy = lazy(() => info().then((m) => ({ default: m.ContentPageView })));
const Blog = lazy(() => info().then((m) => ({ default: m.BlogView })));
const BlogPost = lazy(() => info().then((m) => ({ default: m.BlogPostView })));
const Contact = lazy(() => info().then((m) => ({ default: m.ContactView })));
const Services = lazy(() => info().then((m) => ({ default: m.ServicesView })));
const Faq = lazy(() => info().then((m) => ({ default: m.FaqView })));
const Locations = lazy(() => info().then((m) => ({ default: m.LocationsView })));
const Partners = lazy(() => info().then((m) => ({ default: m.PartnersView })));
const BankDetails = lazy(() => info().then((m) => ({ default: m.BankView })));
const ChatPage = lazy(() => import("./chat/ChatPage"));
const NotFound = lazy(() => import("./site/NotFound"));
const Account = lazy(() => import("./account/Account"));
const AccountInvoices = lazy(() => import("./account/AccountInvoices"));
const AccountInvoice = lazy(() => import("./account/AccountInvoice"));

const CrmDashboard = lazy(() => import("./crm/CrmDashboard"));
const Leads = lazy(() => import("./crm/Leads"));
const LeadDetail = lazy(() => import("./crm/LeadDetail"));
const Invoices = lazy(() => import("./crm/Invoices"));
const InvoiceDetail = lazy(() => import("./crm/InvoiceDetail"));
const Desk = lazy(() => import("./chat/Desk"));
const ops = () => import("./crm/OpsPages");
const UnitsPage = lazy(() => ops().then((m) => ({ default: m.UnitsPage })));
const ReportsPage = lazy(() => ops().then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => ops().then((m) => ({ default: m.UsersPage })));
const FteConsole = lazy(() => import("./fte/FteConsole"));

const page = (el: React.ReactNode) => (
  <Suspense
    fallback={
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    }
  >
    {el}
  </Suspense>
);

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { path: "/", element: page(<Home />) },
      { path: "/shop", element: page(<Shop />) },
      { path: "/vehicles/:slug", element: page(<VehiclePage />) },
      { path: "/login", element: page(<Login />) },
      { path: "/register", element: page(<Register />) },
      { path: "/about", element: page(<ContentPage slug="about" />) },
      { path: "/how-to-buy", element: page(<ContentPage slug="how-to-buy" />) },
      { path: "/terms", element: page(<ContentPage slug="terms" />) },
      { path: "/privacy", element: page(<ContentPage slug="privacy" />) },
      { path: "/services", element: page(<Services />) },
      { path: "/partners", element: page(<Partners />) },
      { path: "/locations", element: page(<Locations />) },
      { path: "/bank-details", element: page(<BankDetails />) },
      { path: "/faq", element: page(<Faq />) },
      { path: "/blog", element: page(<Blog />) },
      { path: "/blog/:slug", element: page(<BlogPost />) },
      { path: "/contact", element: page(<Contact />) },
      { path: "/chat", element: page(<ChatPage />) },
      { path: "/account", element: page(<Account />) },
      { path: "/account/invoices", element: page(<AccountInvoices />) },
      { path: "/account/invoices/:id", element: page(<AccountInvoice />) },
      { path: "*", element: page(<NotFound />) },
    ],
  },
  {
    element: <StaffLayout />,
    children: [
      { path: "/crm", element: page(<CrmDashboard />) },
      { path: "/crm/leads", element: page(<Leads />) },
      { path: "/crm/leads/:id", element: page(<LeadDetail />) },
      { path: "/crm/invoices", element: page(<Invoices />) },
      { path: "/crm/invoices/:id", element: page(<InvoiceDetail />) },
      { path: "/crm/units", element: page(<UnitsPage />) },
      { path: "/crm/reports", element: page(<ReportsPage />) },
      { path: "/crm/users", element: page(<UsersPage />) },
      { path: "/desk", element: page(<Desk />) },
      { path: "/fte", element: page(<FteConsole />) },
    ],
  },
]);

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
