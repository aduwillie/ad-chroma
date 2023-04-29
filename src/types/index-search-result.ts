export type IndexSearchResult = {
  id: string;
  distance: number;
  embedding: number[];
};

export type SearchResult = IndexSearchResult & {
  document: string;
  documentId: string;
};
