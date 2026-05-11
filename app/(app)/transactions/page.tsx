import { Suspense } from "react";
import TransactionsClientPage from "./transactions-client";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải sổ giao dịch...</div>}>
      <TransactionsClientPage />
    </Suspense>
  );
}

