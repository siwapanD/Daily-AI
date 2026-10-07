import { handle, json, idParam } from "@/lib/api";
import { deleteWatchItem } from "@/lib/services/watch";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await deleteWatchItem(idParam.parse((await params).id));
  return json({ ok: true });
});
