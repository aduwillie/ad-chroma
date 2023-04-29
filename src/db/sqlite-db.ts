import { resolve } from "path";
import { DbConfig } from "../types/db-config";
import { Logger } from "../types/logger";
import { Validators } from "../utils/validators";
import { DbIndex } from "./db-index";
import { CollectionRow, CollectionRowMetadata } from "../types/collection-row";
import knex from "knex";
import { Knex } from "knex";
import * as shortUUID from "short-uuid";
import { EmbeddingRow } from "../types/embedding-row";
import { EmbeddingInput } from "../types/embedding-input";
import { QueryInput, SearchQueryInput } from "../types/query-input";
import { IndexSearchResult, SearchResult } from "../types/index-search-result";

const COLLECTIONS_TABLE_NAME = "collections";
const EMBEDDINGS_TABLE_NAME = "embeddings";

export class SqliteDb {
  private _validator: Validators;
  private _knex: Knex<unknown, unknown>;
  private _indexCache: { [collectionId: string]: DbIndex };

  constructor(private dbConfig: DbConfig, private logger: Logger) {
    this._validator = new Validators();
    this._validator.validateDbConfig(dbConfig);

    let dbPath = resolve(dbConfig.persistDirectory, dbConfig.dbName);
    if (!dbPath.endsWith(".db")) {
      dbPath += ".db";
    }
    this._knex = knex({
      client: "sqlite3",
      connection: {
        filename: dbPath,
      },
    });

    this.setupCollectionsTable();
    this.setupEmbeddingsTable();
  }

  private async setupCollectionsTable() {
    await this._knex.raw(`
      CREATE TABLE IF NOT EXISTS ${COLLECTIONS_TABLE_NAME}(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        metadata TEXT,
      )`);
  }

  private async setupEmbeddingsTable() {
    await this._knex.raw(`
      CREATE TABLE IF NOT EXISTS ${EMBEDDINGS_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        collectionId TEXT,
        embedding TEXT NOT NULL,
        document TEXT,
        documentId TEXT,
        arg1 TEXT,
        arg2 TEXT,
        arg3 TEXT
      )`);
  }

  private async createIndexForCollection(collectionId: string) {
    if (!this._indexCache[collectionId]) {
      const collectionRow = await this.getCollectionById(collectionId);
      if (!collectionRow) {
        throw new Error(
          "cannot create an index for a collection which does not exist."
        );
      }

      const decodedMetadata: CollectionRowMetadata = JSON.parse(
        collectionRow.metadata
      );
      const index = new DbIndex(
        {
          id: collectionId,
          persistDirectory: this.dbConfig.persistDirectory,
          ...decodedMetadata,
        },
        this.logger
      );

      this._indexCache[collectionId] = index;
    }

    return this._indexCache[collectionId];
  }

  public async createCollection(
    name: string,
    metadata: CollectionRowMetadata,
    getOrCreate: boolean = false
  ): Promise<CollectionRow> {
    const existingCollection = await this.getCollectionByName(name);
    if (existingCollection) {
      if (getOrCreate) {
        this.logger.info(
          `Collection with name ${name} already exists. Returning existing collection to caller.`
        );
        return existingCollection;
      }

      throw new Error(`Collection with name ${name} already exists`);
    }

    const id = shortUUID.generate().toString();
    const dataToInsert: CollectionRow = {
      id,
      name,
      metadata: JSON.stringify(metadata),
    };
    await knex<CollectionRow>(COLLECTIONS_TABLE_NAME).insert(dataToInsert);

    // Create corresponding index
    await this.createIndexForCollection(id);

    return dataToInsert;
  }

  public async listCollections(): Promise<CollectionRow[]> {
    const results = await this._knex<CollectionRow>(
      COLLECTIONS_TABLE_NAME
    ).select();

    return results;
  }

  public async updateCollection(
    currentName: string,
    newName: string,
    newMetadata: CollectionRowMetadata
  ) {
    const currentCollection = await this.getCollectionByName(currentName);
    if (!currentCollection) {
      throw new Error(
        `Unable to update a non-existent collection by name ${currentName}`
      );
    }

    if (!newName) {
      newName = currentName;
    }
    if (!newMetadata) {
      newMetadata = JSON.parse(currentCollection.metadata);
    }

    this._validator.validateCollectionRowMetadata(newMetadata);

    return await this._knex<CollectionRow>(COLLECTIONS_TABLE_NAME).update({
      name: newName,
      metadata: JSON.stringify(newMetadata),
    });
  }

  public async addEmbeddingToCollection(input: EmbeddingInput) {
    const {
      collectionName,
      document,
      documentId,
      embedding,
      arg1,
      arg2,
      arg3,
    } = input;

    const collection = await this.getCollectionByName(collectionName);
    if (!collection) {
      throw new Error(
        `Unable to add to a non-existent collection by name ${collectionName}`
      );
    }

    const { id } = await this._knex.transaction((trx) => {
      const dataToInsert: EmbeddingRow = {
        id: shortUUID.generate().toString(),
        collectionId: collection.id,
        embedding: embedding.toString(),
        document,
        documentId,
        arg1,
        arg2,
        arg3,
      };

      const index = this._indexCache[collection.id];

      if (!index) {
        throw new Error("Cannot insert data to missing index.");
      }

      return index
        .add([{ ...dataToInsert, embedding }])
        .then(() => trx(EMBEDDINGS_TABLE_NAME).insert(dataToInsert))
        .then(() => dataToInsert);
    });

    return id;
  }

  public async updateEmbedding(
    input: EmbeddingInput & { embeddingId: string }
  ): Promise<void> {
    const {
      embeddingId,
      collectionName,
      document,
      documentId,
      embedding,
      arg1,
      arg2,
      arg3,
    } = input;

    const collection = await this.getCollectionByName(collectionName);
    if (!collection) {
      throw new Error(
        `Unable to perform an update on a non-existent collection by name ${collectionName}`
      );
    }

    const embeddingFromDb = await this.getEmbeddingById(embeddingId);
    if (!embeddingFromDb) {
      throw new Error(`Cannot update an unknown embedding: ${embeddingId}`);
    }

    if (embeddingFromDb.collectionId !== collection.id) {
      throw new Error(
        `Embedding with id ${embeddingId} does not belong to collection ${collectionName}`
      );
    }

    await this._knex.transaction((trx) => {
      const index = this._indexCache[collection.id];

      return index.add([{ embedding, id: embeddingId }], true).then(() =>
        trx<EmbeddingRow>(EMBEDDINGS_TABLE_NAME).update({
          document,
          documentId,
          embedding:
            embedding && embedding.length
              ? JSON.stringify(embedding)
              : undefined,
          arg1,
          arg2,
          arg3,
        })
      );
    });
  }

  public async get(queryInput: QueryInput): Promise<EmbeddingRow[]> {
    const { collectionName, where } = queryInput;

    const collection = await this.getCollectionByName(collectionName);
    if (!collection) {
      throw new Error(
        `Unable to get a query from a non-existent collection by name ${collectionName}`
      );
    }

    const dbQuery = this._knex<EmbeddingRow>(EMBEDDINGS_TABLE_NAME).select();

    // Poor man's query builder
    dbQuery.where((builder) => {
      if (where.documentId) {
        builder.where("documentId", where.documentId);
      }
      if (where.embeddingIds && where.embeddingIds.length) {
        builder.whereIn("id", where.embeddingIds);
      }
      if (where.embedding) {
        builder.where("embedding", where.embedding);
      }
      if (where.arg1) {
        builder.where("arg1", where.arg1);
      }
      if (where.arg2) {
        builder.where("arg2", where.arg2);
      }
      if (where.arg3) {
        builder.where("arg3", where.arg3);
      }
    });

    const results = await dbQuery;
    return results;
  }

  public async getNearestNeighbors(queryInput: SearchQueryInput): Promise<SearchResult[]> {
    this._validator.validateSearchQueryInput(queryInput);

    const collection = await this.getCollectionByName(queryInput.collectionName);
    if (!collection) {
      throw new Error(`Invalid collection name specified: ${queryInput.collectionName}`);
    }
    const embeddingIds = (await this.get(queryInput)).map(r => r.id);

    const index = this._indexCache[collection.id];
    const indexSearchResults: IndexSearchResult[] = await index.search(queryInput.searchEmbedding,  queryInput.nearestNeighbors, embeddingIds);

    // Hydrate the index results with the actual document and documentId if available
    const searchResults: SearchResult[] = [];
    for await (const result of indexSearchResults) {
      const { document, documentId } = await this.getEmbeddingById(result.id);
      searchResults.push({
        ...result,
        documentId,
        document,
      });
    }

    return searchResults;
  }

  public async countEmbeddingsByCollectionName(collectionName: string) {
    const collection = await this.getCollectionByName(collectionName);
    if (!collection) {
      throw new Error(
        `Unable to get a count for a non-existent collection by name ${collectionName}`
      );
    }

    return this._knex<EmbeddingRow>(EMBEDDINGS_TABLE_NAME)
      .where("collectionId", collection.id)
      .count();
  }

  public async deleteEmbedding(collectionName: string, embeddingId: string) {
    const collection = await this.getCollectionByName(collectionName);
    if (!collection) {
      throw new Error(
        `Unable to perform a delete on a non-existent collection by name ${collectionName}`
      );
    }

    const embeddingFromDb = await this.getEmbeddingById(embeddingId);
    if (!embeddingFromDb) {
      throw new Error(`Cannot delete an unknown embedding: ${embeddingId}`);
    }

    if (embeddingFromDb.collectionId !== collection.id) {
      throw new Error(
        `Embedding with id ${embeddingId} does not belong to collection ${collectionName}`
      );
    }

    return this._knex.transaction((trx) => {
      const index = this._indexCache[collection.id];

      return index
        .delete([embeddingId])
        .then(() =>
          trx<EmbeddingRow>(EMBEDDINGS_TABLE_NAME)
            .where("id", embeddingId)
            .delete()
        );
    });
  }

  private async dropCollectionIndex(collectionId: string) {
    const index = this._indexCache[collectionId];
    if (!index) {
      return;
    }

    await index.dropIndex();
    delete this._indexCache[collectionId];
  }

  private async getCollectionById(
    collectionId: string
  ): Promise<CollectionRow> {
    return await this._knex<CollectionRow>(COLLECTIONS_TABLE_NAME)
      .where("id", collectionId)
      .first();
  }

  private async getCollectionByName(
    collectionName: string
  ): Promise<CollectionRow> {
    return await this._knex<CollectionRow>(COLLECTIONS_TABLE_NAME)
      .where("id", collectionName)
      .first();
  }

  private async getEmbeddingById(embeddingId: string): Promise<EmbeddingRow> {
    return await this._knex<EmbeddingRow>(EMBEDDINGS_TABLE_NAME)
      .where("id", embeddingId)
      .first();
  }
}
