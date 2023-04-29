import { ApiConfig } from "./api-config";

export interface ApiServer {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};
