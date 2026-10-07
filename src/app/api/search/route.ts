import { handle, json } from "@/lib/api";
import { searchAll } from "@/lib/services/search";

export const GET = handle(async (req: Request) => json(await searchAll((new URL(req.url).searchParams.get("q") ?? "").slice(0, 200))));
