import { CollectionRow, CollectionRowMetadata } from "./collection-row";
import { EmbeddingInput } from "./embedding-input";
import { EmbeddingRow } from "./embedding-row";
import { SearchResult } from "./index-search-result";
import { QueryInput, SearchQueryInput } from "./query-input";

export interface Db {
  createCollection(
    name: string,
    metadata: CollectionRowMetadata,
    getOrCreate: boolean
  ): Promise<CollectionRow>;
  listCollections(): Promise<CollectionRow[]>;
  updateCollection(
    currentName: string,
    newName: string,
    newMetadata: CollectionRowMetadata
  ): {};
  addEmbeddingToCollection(input: EmbeddingInput): {};
  updateEmbedding(
    input: EmbeddingInput & { embeddingId: string }
  ): Promise<void>;
  get(queryInput: QueryInput): Promise<EmbeddingRow[]>;
  getNearestNeighbors(queryInput: SearchQueryInput): Promise<SearchResult[]>;
  countEmbeddingsByCollectionName(collectionName: string): {};
  deleteEmbedding(collectionName: string, embeddingId: string): {};
}
