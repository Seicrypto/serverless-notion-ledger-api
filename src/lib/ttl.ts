export const TTL_SECONDS = {
  dashboard: 600,
  detailList: 300,
  organizationMembers: 600,
  organizationProfile: 1800,
  publicDashboardSnapshot: 1800,
} as const;

export type TtlKey = keyof typeof TTL_SECONDS;
