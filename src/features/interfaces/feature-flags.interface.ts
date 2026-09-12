export interface FeatureFlagRules {
  allowedUsers?: string[];
  allowedRoles?: string[];
  percentage?: number; // 0 a 100
}

export interface FeatureFlagContext {
  userId?: string;
  role?: string;
}

export interface FeatureFlagData {
  isEnabled: boolean;
  rules?: FeatureFlagRules | null;
}
