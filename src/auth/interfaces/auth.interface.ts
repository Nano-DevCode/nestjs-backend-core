export interface UserAuthContext {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  isTwoFactorEnabled: boolean;
}

export interface UserAuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    isTwoFactorEnabled: boolean;
  };
}
