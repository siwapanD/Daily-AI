import { handle, json, limitRequest } from "@/lib/api";
import { searchAll } from "@/lib/services/search";
import { semanticSearch } from "@/lib/services/embeddings";

/** GET /api/search?q=…&mode=keyword|semantic */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").slice(0, 200);
  if (sp.get("mode") === "semantic") {
    limitRequest(req, "semantic", 30);
    return json({ mode: "semantic", hits: await semanticSearch(q, 30) });
  }
  return json(await searchAll(q));
});
