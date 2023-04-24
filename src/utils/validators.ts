import FastestValidator from "fastest-validator";
import { IndexConfig, IndexConfigSchema } from "../types/index-config";
import { IndexData, IndexDataSchema } from "../types/index-data";

export class Validators {
  private _validator: FastestValidator;

  constructor() {
    this._validator = new FastestValidator();
  }

  public validateIndexConfig(indexConfig: IndexConfig) {
    const check = this._validator.compile(IndexConfigSchema);
    return check(indexConfig);
  }

  public validateIndexData(indexData: IndexData) {
    const check = this._validator.compile(IndexDataSchema);
    return check(indexData);
  }
}
