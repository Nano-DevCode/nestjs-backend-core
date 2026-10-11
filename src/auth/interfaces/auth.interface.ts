export interface UserAuthContext {
  id: string;
  email: string;
  name?: string | null;
  roles: string[];
  permissions: string[];
  isTwoFactorEnabled: boolean;
  priority?: number;
  isProfileComplete?: boolean;
}

export interface UserAuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    roles: string[];
    permissions: string[];
    isTwoFactorEnabled: boolean;
    isProfileComplete?: boolean;
  };
}

