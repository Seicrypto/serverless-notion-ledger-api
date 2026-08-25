import type { OrganizationMemberRecord, OrganizationRecord } from "../repositories/types";
import type { AuthenticatedSession } from "../services/auth/session-auth-service";
import type { Env } from "./env";

export type AppBindings = {
  Bindings: Env;
  Variables: {
    organization?: OrganizationRecord;
    organizationMembership?: OrganizationMemberRecord | null;
    requestId: string;
    session?: AuthenticatedSession;
  };
};
