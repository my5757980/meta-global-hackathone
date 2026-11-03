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
const ResetPassword = lazy(() => import("./site/ResetPassword"));
const Credits = lazy(() => import("./site/Credits"));
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
const auc = () => import("./auction/AuctionPages");
const AuctionWelcome = lazy(() => auc().then((m) => ({ default: m.AuctionWelcome })));
const AuctionList = lazy(() => auc().then((m) => ({ default: m.AuctionList })));
const AuctionLotPage = lazy(() => auc().then((m) => ({ default: m.AuctionLotPage })));
const AuctionStatistics = lazy(() => auc().then((m) => ({ default: m.AuctionStatistics })));
const AuctionStatDetail = lazy(() => auc().then((m) => ({ default: m.AuctionStatDetail })));
const AuctionMe = lazy(() => auc().then((m) => ({ default: m.AuctionMe })));
const AuctionAdmin = lazy(() => import("./auction/AuctionAdmin").then((m) => ({ default: m.AuctionAdmin })));
const AuctionEnquiryPage = lazy(() => import("./auction/AuctionAdmin").then((m) => ({ default: m.AuctionEnquiryPage })));
const Account = lazy(() => import("./account/Account"));
const AccountInvoices = lazy(() => import("./account/AccountInvoices"));
const AccountInvoice = lazy(() => import("./account/AccountInvoice"));
const AccountOrders = lazy(() => import("./account/AccountOrders"));
const shopPages = () => import("./site/ShopPages");
const Wishlist = lazy(() => shopPages().then((m) => ({ default: m.WishlistView })));
const Cart = lazy(() => shopPages().then((m) => ({ default: m.CartView })));
const Checkout = lazy(() => shopPages().then((m) => ({ default: m.CheckoutView })));
const PayPage = lazy(() => import("./site/PayPage"));

const CrmDashboard = lazy(() => import("./crm/CrmDashboard"));
const Leads = lazy(() => import("./crm/Leads"));
const LeadDetail = lazy(() => import("./crm/LeadDetail"));
const Invoices = lazy(() => import("./crm/Invoices"));
const InvoiceDetail = lazy(() => import("./crm/InvoiceDetail"));
const Desk = lazy(() => import("./chat/Desk"));
const ops = () => import("./crm/OpsPages");
const UnitPage = lazy(() => import("./crm/UnitPage"));
const UnitsPage = lazy(() => ops().then((m) => ({ default: m.UnitsPage })));
const ReportsPage = lazy(() => ops().then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => ops().then((m) => ({ default: m.UsersPage })));
const FteConsole = lazy(() => import("./fte/FteConsole"));
const adminPages = () => import("./admin/AdminPages");
const AdminOverview = lazy(() => adminPages().then((m) => ({ default: m.AdminOverview })));
const AdminVehicles = lazy(() => adminPages().then((m) => ({ default: m.AdminVehicles })));
const AdminHome = lazy(() => adminPages().then((m) => ({ default: m.AdminHome })));
const AdminPagesList = lazy(() => adminPages().then((m) => ({ default: m.AdminPagesList })));
const AdminSettings = lazy(() => adminPages().then((m) => ({ default: m.AdminSettings })));
const AdminMessages = lazy(() => adminPages().then((m) => ({ default: m.AdminMessages })));
const AdminOrders = lazy(() => adminPages().then((m) => ({ default: m.AdminOrders })));
const adminMore = () => import("./admin/AdminMore");
const AdminContent = lazy(() => adminMore().then((m) => ({ default: m.AdminContent })));
const AdminBrands = lazy(() => adminMore().then((m) => ({ default: m.AdminBrands })));
const AdminCustomers = lazy(() => adminMore().then((m) => ({ default: m.AdminCustomers })));
const AdminCustomerDetail = lazy(() => adminMore().then((m) => ({ default: m.AdminCustomerDetail })));
const AdminRoles = lazy(() => adminMore().then((m) => ({ default: m.AdminRoles })));
const AdminNewsletter = lazy(() => adminMore().then((m) => ({ default: m.AdminNewsletter })));
const AdminMedia = lazy(() => adminMore().then((m) => ({ default: m.AdminMedia })));

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
      { path: "/reset-password", element: page(<ResetPassword />) },
      { path: "/credits", element: page(<Credits />) },
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
      { path: "/auction", element: page(<AuctionWelcome />) },
      { path: "/auction/list", element: page(<AuctionList />) },
      { path: "/auction/lots/:id", element: page(<AuctionLotPage />) },
      { path: "/auction/statistics", element: page(<AuctionStatistics />) },
      { path: "/auction/statistics/:id", element: page(<AuctionStatDetail />) },
      { path: "/auction/me", element: page(<AuctionMe />) },
      { path: "/account", element: page(<Account />) },
      { path: "/account/invoices", element: page(<AccountInvoices />) },
      { path: "/account/invoices/:id", element: page(<AccountInvoice />) },
      { path: "/account/orders", element: page(<AccountOrders />) },
      { path: "/wishlist", element: page(<Wishlist />) },
      { path: "/cart", element: page(<Cart />) },
      { path: "/checkout", element: page(<Checkout />) },
      { path: "/pay/:id", element: page(<PayPage />) },
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
      { path: "/crm/units/:id", element: page(<UnitPage />) },
      { path: "/crm/reports", element: page(<ReportsPage />) },
      { path: "/crm/users", element: page(<UsersPage />) },
      { path: "/desk", element: page(<Desk />) },
      { path: "/auction/admin", element: page(<AuctionAdmin />) },
      { path: "/auction/admin/enquiries/:id", element: page(<AuctionEnquiryPage />) },
      { path: "/fte", element: page(<FteConsole />) },
      { path: "/admin", element: page(<AdminOverview />) },
      { path: "/admin/vehicles", element: page(<AdminVehicles />) },
      { path: "/admin/home", element: page(<AdminHome />) },
      { path: "/admin/pages", element: page(<AdminPagesList />) },
      { path: "/admin/settings", element: page(<AdminSettings />) },
      { path: "/admin/messages", element: page(<AdminMessages />) },
      { path: "/admin/orders", element: page(<AdminOrders />) },
      { path: "/admin/content", element: page(<AdminContent />) },
      { path: "/admin/brands", element: page(<AdminBrands />) },
      { path: "/admin/customers", element: page(<AdminCustomers />) },
      { path: "/admin/customers/:id", element: page(<AdminCustomerDetail />) },
      { path: "/admin/roles", element: page(<AdminRoles />) },
      { path: "/admin/newsletter", element: page(<AdminNewsletter />) },
      { path: "/admin/media", element: page(<AdminMedia />) },
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
