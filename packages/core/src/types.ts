export interface AuthConfig {
  type: "Bearer" | "Basic" | "API_KEY";
  token: string;
}

export interface WidgetConfig {
  baseURL: string;
  auth?: AuthConfig;
}

export interface WidgetTheme {
  primary: string;
  radius: "sm" | "md" | "lg" | "xl";
  mode: "light" | "dark";
}

// Backend Adapter Interface - যেকোনো Backend এর সাথে কানেক্ট করার জন্য
export interface EmailAdapter {
  sendEmail: (payload: any) => Promise<any>;
  sendBulk: (payload: any) => Promise<any>;
  mailbox: (params?: any) => Promise<any[]>;
  logs: (params?: any) => Promise<any[]>;
  analytics: () => Promise<any>;
}

export interface WidgetProps {
  mode?: "dashboard" | "composer" | "mailbox" | "logs";
  layout?: "full" | "embedded";
  theme?: Partial<WidgetTheme>;
  adapter?: Partial<EmailAdapter>;
  baseURL?: string;
  token?: string;
}
