"use client";
import { useSearchParams } from "next/navigation";

/** Shows ?msg= / ?err= set by server actions after redirect. */
export function Flash() {
  const sp = useSearchParams();
  const msg = sp.get("msg");
  const err = sp.get("err");
  if (!msg && !err) return null;
  return (
    <div role="status" className={`mb-4 rounded-md border px-3 py-2 text-sm ${err ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"}`}>
      {err ?? msg}
    </div>
  );
}
