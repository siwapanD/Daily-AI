import { sourceBody } from "@/lib/schemas";
import { handle, json, readJson } from "@/lib/api";
import { createSource, listSources } from "@/lib/services/discovery";


export const GET = handle(async () => json(await listSources()));
export const POST = handle(async (req: Request) => json(await createSource(sourceBody.parse(await readJson(req))), 201));
