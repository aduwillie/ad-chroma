import FastestValidator, { ValidationSchema } from "fastest-validator";
import { IndexConfig, IndexConfigSchema } from "../types/index-config";
import { IndexData, IndexDataSchema } from "../types/index-data";
import { DbConfig, DbConfigSchema } from "../types/db-config";
import {
  CollectionRowMetadata,
  CollectionRowMetadatachema,
} from "../types/collection-row";
import { SearchQueryInput, SearchQueryInputSchema } from "../types/query-input";
import { ApiConfig, ApiConfigSchema } from "../types/api-config";

export class Validators {
  private _validator: FastestValidator;

  constructor() {
    this._validator = new FastestValidator();
  }

  public validateIndexConfig(indexConfig: IndexConfig) {
    return this.validate(IndexConfigSchema, indexConfig);
  }

  public validateIndexData(indexData: IndexData) {
    return this.validate(IndexDataSchema, indexData);
  }

  public validateDbConfig(dbConfig: DbConfig) {
    return this.validate(DbConfigSchema, dbConfig);
  }

  public validateCollectionRowMetadata(metadata: CollectionRowMetadata) {
    return this.validate(CollectionRowMetadatachema, metadata);
  }

  public validateSearchQueryInput(searchInput: SearchQueryInput) {
    return this.validate(SearchQueryInputSchema, searchInput);
  }

  public validateApiConfig(apiConfig: ApiConfig) {
    return this.validate(ApiConfigSchema, apiConfig);
  }

  private validate<T>(schema: ValidationSchema, data: unknown) {
    const check = this._validator.compile(schema);
    return check(data);
  }
}
