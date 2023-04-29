import { DbConfig } from "./db-config";

export type ApiConfig = {
  port: number;
  host?: string;
} & DbConfig;

export const ApiConfigSchema = {
  port: "number|positive|integer",
  host: "string|optional",
} as const;
