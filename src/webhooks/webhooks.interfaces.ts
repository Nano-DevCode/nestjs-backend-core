export interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  description?: string;
  createdAt: string;
}

export interface WebhookEventPayload<T = unknown> {
  id: string;
  event: string;
  timestamp: string;
  data: T;
}

export interface WebhookJobData {
  deliveryId: string;
  subscriptionId: string;
  targetUrl: string;
  secret: string;
  event: string;
  payload: WebhookEventPayload;
}

