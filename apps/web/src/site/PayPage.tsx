import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard } from "lucide-react";
import { api } from "../lib/api";
import { usd } from "../lib/format";
import { useAuth } from "../lib/auth";
import { Button, Card, LinkButton, Skeleton } from "../ui";

interface Order {
  id: string;
  orderNo: string;
  totalUsd: number;
  payNowUsd: number | null;
  paidUsd: number | null;
  status: string;
  paymentMethod: string;
  paidAt: string | null;
  paymentRef: string | null;
}

/** Where a buyer pays an order online, and where PayPal brings them back to. */
export default function PayPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pay-order", id], queryFn: () => api.get<Order>(`/api/shop/orders/${id}`), enabled: !!me });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);

  const capture = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (!q.data?.paymentRef) await api.post(`/api/shop/orders/${id}/pay`, {}); // an order whose payment was never started
      await api.post(`/api/shop/orders/${id}/capture`, {});
      await qc.invalidateQueries({ queryKey: ["pay-order", id] });
      void qc.invalidateQueries({ queryKey: ["my-orders"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ approveUrl: string | null }>(`/api/shop/orders/${id}/pay`, {});
      if (r.approveUrl) window.location.assign(r.approveUrl);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // back from PayPal: take the money straight away
  const back = params.get("token");
  useEffect(() => {
    if (back && q.data && !q.data.paidAt && !ran.current) {
      ran.current = true;
      void capture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back, q.data]);

  if (!me)
    return (
      <div className="container-page py-12">
        <Card className="mx-auto max-w-lg text-center">
          <p className="font-semibold text-slate-900">Paying from the app?</p>
          <p className="mt-1 text-sm text-slate-600">Go back to the app and press "I have paid". On the website, sign in to finish.</p>
          <LinkButton to={`/login?next=/pay/${id}`} className="mt-4">Sign in</LinkButton>
        </Card>
      </div>
    );
  if (q.isLoading) return <div className="container-page py-12"><Skeleton className="mx-auto h-60 max-w-lg" /></div>;
  const o = q.data;
  if (!o) return <div className="container-page py-12"><Card className="mx-auto max-w-lg text-center">Order not found.</Card></div>;
  const demo = o.paymentMethod === "Online (demo)";
  return (
    <div className="container-page py-12">
      <Card className="mx-auto max-w-lg text-center">
        {o.paidAt ? (
          <>
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Payment received</h1>
            <p className="mt-1 text-sm text-slate-600">{usd(o.totalUsd)} for order <span className="font-bold text-slate-900">{o.orderNo}</span>. Your invoice is being prepared, and you will see it in the chat and in your account.</p>
            <LinkButton to="/account/orders" className="mt-5">View my orders</LinkButton>
          </>
        ) : (
          <>
            <CreditCard className="mx-auto size-12 text-brand-600" />
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Pay order {o.orderNo}</h1>
            <p className="mt-1 text-3xl font-extrabold text-brand-700">{usd(o.totalUsd)}</p>
            {demo ? (
              <>
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This is a demo stand-in for the payment page. No money moves, and nothing is asked of you. A company with its own PayPal keys gets the real page here.</p>
                <Button size="lg" className="mt-4 w-full" loading={busy} onClick={() => void capture()}>Approve demo payment</Button>
              </>
            ) : (
              <>
                <Button size="lg" className="mt-4 w-full" loading={busy} onClick={() => void pay()}>Pay with PayPal</Button>
                {o.paymentRef && <Button variant="secondary" className="mt-2 w-full" disabled={busy} onClick={() => void capture()}>I have paid: check again</Button>}
              </>
            )}
            <LinkButton to="/account/orders" variant="secondary" className="mt-2 w-full">Not now</LinkButton>
          </>
        )}
        {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
      </Card>
    </div>
  );
}
