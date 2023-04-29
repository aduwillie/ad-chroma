export type DbConfig = {
  persistDirectory: string;
  dbName: string;
};

export const DbConfigSchema = {
  persistDirectory: "string|required",
  dbName: "string|required",
} as const;
