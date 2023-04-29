export type QueryInput = {
  collectionName: string;
  where: {
    embedding: number[];
    documentId?: string;
    embeddingIds?: string[];
    arg1?: string;
    arg2?: string;
    arg3?: string;
  };
};

export type SearchQueryInput = QueryInput & {
  searchEmbedding: number[];
  nearestNeighbors: number;
};

export const SearchQueryInputSchema = {
  collectionName: "string|required",
  where: {
    type: "object",
    props: {
      embedding: { type: "array", items: "number" },
      documentId: "string|optional",
      embeddingIds: { type: "array", items: "string", optional: true },
      arg1: "string|optional",
      arg2: "string|optional",
      arg3: "string|optional",
    },
  },
  searchEmbedding: { type: "array", items: "number", required: true },
  nearestNeighbors: "number|positive|integer:true|min:1"
} as const;
