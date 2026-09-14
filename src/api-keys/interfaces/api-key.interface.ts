export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  isActive: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}
