function normalize(input: string): string {
  return input.trim().toLowerCase();
}

export const cacheKeys = {
  organizationMembers: (organizationId: string) =>
    `org:${normalize(organizationId)}:members:v1`,
  organizationProfile: (organizationId: string) =>
    `org:${normalize(organizationId)}:profile:v1`,
  organizationDashboard: (organizationId: string) =>
    `org:${normalize(organizationId)}:dashboard:v1`,
  userDashboard: (organizationId: string, userId: string) =>
    `org:${normalize(organizationId)}:user:${normalize(userId)}:dashboard:v1`,
  ledgerQuery: (organizationId: string, queryHash: string) =>
    `org:${normalize(organizationId)}:ledger:${normalize(queryHash)}:v1`,
} as const;
