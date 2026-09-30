import { kleurplaatModellen } from "@/lib/kleurplaat/opslag";
import { modellenRoutes } from "@/lib/replicate/modellen-routes";

export const runtime = "nodejs";

export const { GET, POST, DELETE } = modellenRoutes(kleurplaatModellen);
