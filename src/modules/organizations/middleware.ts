import type { MiddlewareHandler } from "hono";
import { D1Client } from "../../infrastructure/d1/d1-client";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { getSessionCookie } from "../../lib/session-cookie";
import { OrganizationMembersRepository } from "../../repositories/organization-members-repository";
import { OrganizationsRepository } from "../../repositories/organizations-repository";
import { SessionAuthService } from "../../services/auth/session-auth-service";
import type { AppBindings } from "../../types/hono";

function isNumericIdentifier(value: string): boolean {
  return /^\d+$/.test(value);
}

async function requireOrganizationByIdentifier(
  organizations: OrganizationsRepository,
  identifier: string,
) {
  const organization = isNumericIdentifier(identifier)
    ? await organizations.findById(Number(identifier))
    : await organizations.findByVanity(identifier);

  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  return organization;
}

type OrganizationRoleRequirement = "member" | "manager" | "owner";

function hasRequiredRole(
  role: "owner" | "admin" | "member",
  requirement: OrganizationRoleRequirement,
): boolean {
  if (requirement === "member") {
    return true;
  }

  if (requirement === "manager") {
    return role === "owner" || role === "admin";
  }

  return role === "owner";
}

function createOrganizationAccessMiddleware(
  requiredRole: OrganizationRoleRequirement,
): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const sessionAuth = new SessionAuthService(c.env);
    const session = await sessionAuth.requireActiveUser(getSessionCookie(c));
    const organizationIdentifier = c.req.param("organization");

    if (!organizationIdentifier) {
      throw new NotFoundError("Organization not found");
    }

    const db = new D1Client(c.env.APP_DB);
    const organizations = new OrganizationsRepository(db);
    const members = new OrganizationMembersRepository(db);
    const organization = await requireOrganizationByIdentifier(
      organizations,
      organizationIdentifier,
    );
    const membership = await members.findByOrganizationAndUser(
      organization.id,
      session.user.id,
    );

    if (!membership || membership.status !== "active") {
      throw new ForbiddenError("Organization membership is required", {
        code: "ORGANIZATION_MEMBER_REQUIRED",
      });
    }

    if (!hasRequiredRole(membership.role, requiredRole)) {
      const message =
        requiredRole === "owner"
          ? "Organization owner access is required"
          : requiredRole === "manager"
            ? "Organization manager access is required"
            : "Organization membership is required";
      const code =
        requiredRole === "owner"
          ? "ORGANIZATION_OWNER_REQUIRED"
          : requiredRole === "manager"
            ? "ORGANIZATION_MANAGER_REQUIRED"
            : "ORGANIZATION_MEMBER_REQUIRED";

      throw new ForbiddenError(message, { code });
    }

    c.set("organization", organization);
    c.set("organizationMembership", membership);
    c.set("session", session);

    await next();
  };
}

export const requireTargetOrganizationMember =
  createOrganizationAccessMiddleware("member");

export const requireTargetOrganizationManager =
  createOrganizationAccessMiddleware("manager");

export const requireTargetOrganizationOwner =
  createOrganizationAccessMiddleware("owner");
