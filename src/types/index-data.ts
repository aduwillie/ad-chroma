export type IndexData = {
  id: string;
  embedding: number[];
};

export const IndexDataSchema = {
  id: "string|required",
  embedding: "number[]",
} as const;
