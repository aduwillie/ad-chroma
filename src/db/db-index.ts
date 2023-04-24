import { existsSync, mkdirSync, rmdir, rmdirSync } from "fs";
import { HierarchicalNSW } from "hnswlib-node";
import { Validators } from "../utils/validators";
import { IndexConfig } from "../types/index-config";
import { IndexMetadata } from "../types/index-metadata";
import { Logger } from "../types/logger";
import { IndexData } from "../types/index-data";
import { IndexSearchResult } from "../types/index-search-result";

const DEFAULT_MAX_ELEMENTS_IN_INDEX = 1000;
const DEFAULT_SIZE_OF_DYNAMIC_LIST_OF_NEAREST_NEIGHBORS = 10;

export class DbIndex {
  private _index: HierarchicalNSW | null;
  private _indexMetadata: IndexMetadata | null;
  private _validator: Validators;

  private _saveFolder: string;
  private idToLabel: Record<string, number>;
  private labelToId: Record<number, string>;

  constructor(private indexConfig: IndexConfig, private logger: Logger) {
    this._validator = new Validators();
    this._validator.validateIndexConfig(indexConfig);

    this._index = null;
    this._indexMetadata = null;
    this.idToLabel = {};
    this.labelToId = {};

    this.load();
  }

  private async initIndex() {
    this._index = new HierarchicalNSW(
      "cosine",
      this.indexConfig.numberOfDimensions
    );
    this._index.initIndex(
      this.indexConfig.maxElements ?? DEFAULT_MAX_ELEMENTS_IN_INDEX
    );
    this._index.setEf(
      this.indexConfig.sizeOfDynamicListOfNearestNeighbors ??
        DEFAULT_SIZE_OF_DYNAMIC_LIST_OF_NEAREST_NEIGHBORS
    );

    this._indexMetadata = {
      dimensionality: "cosine",
      elements: 0,
      timeCreated: +new Date(),
    };

    this._saveFolder = `${this.indexConfig.persistDirectory}/index`;
    await this.save();
  }

  private async save() {
    if (!existsSync(this._saveFolder)) {
      mkdirSync(this._saveFolder, { recursive: true });
    }

    if (!this._index) {
      return;
    }

    const indexSavePath = `${this._saveFolder}/index_${this.indexConfig.id}.bin`;
    await this._index.writeIndex(indexSavePath);
    this.logger.debug(`Index saved to ${indexSavePath}`);
  }

  private async load() {
    const indexSavePath = `${this._saveFolder}/index_${this.indexConfig.id}.bin`;
    if (!existsSync(indexSavePath)) {
      return;
    }

    this._index = new HierarchicalNSW(
      "cosine",
      this.indexConfig.numberOfDimensions
    );
    this._index.readIndexSync(indexSavePath);
    this._index.setEf(
      this.indexConfig.sizeOfDynamicListOfNearestNeighbors ??
        DEFAULT_SIZE_OF_DYNAMIC_LIST_OF_NEAREST_NEIGHBORS
    );
  }

  public async dropIndex() {
    this._index && rmdirSync(this._saveFolder);

    this._index = null;
    this.idToLabel = {};
    this.labelToId = {};
  }

  public async add(indexData: IndexData[], update: boolean = false) {
    const dimension = indexData[0].embedding.length;

    if (!this._index) {
      await this.initIndex();
    }

    if (dimension !== this._index.getNumDimensions()) {
      throw new Error(
        `Dimension of data ${dimension} does not match index dimension ${this._index.getNumDimensions()}`
      );
    }

    for (const { id } of indexData) {
      if (this.idToLabel[id]) {
        if (update) {
          continue;
        } else {
          throw new Error(`The id ${id} already exists in the index`);
        }
      } else {
        this._indexMetadata.elements += 1;
        const nextLabel = this._indexMetadata.elements;

        this.idToLabel[id] = nextLabel;
        this.labelToId[nextLabel] = id;
      }
    }

    if (this._indexMetadata.elements > this._index.getCurrentCount()) {
      const newSize = Math.max(
        this._indexMetadata.elements * this.indexConfig.indexResizeFactor,
        DEFAULT_MAX_ELEMENTS_IN_INDEX
      );
      this._index.resizeIndex(newSize);
    }

    for (const { id, embedding } of indexData) {
      this._index.addPoint(embedding, this.idToLabel[id]);
    }

    await this.save();
  }

  public async delete(ids: string[]) {
    for (const id of ids) {
      const label = this.idToLabel[id];
      this._index.markDelete(label);

      delete this.labelToId[label];
      delete this.idToLabel[id];
    }

    await this.save();
  }

  public async search(
    query: number[],
    k: number,
    ids: string[] = []
  ): Promise<IndexSearchResult[]> {
    if (!this._index) {
      throw new Error("Index not created. Create one before searching");
    }

    const dimension = query.length;
    if (dimension !== this._index.getNumDimensions()) {
      throw new Error(
        `Dimension of query ${dimension} does not match index dimension ${this._index.getNumDimensions()}`
      );
    }

    if (k > this._indexMetadata.elements) {
      throw new Error(
        `Number of requested results ${k} cannot be greater than elements in index ${this._indexMetadata.elements}`
      );
    }

    // Pre-process
    const labels = new Set<number>();
    if (ids.length) {
      ids.forEach((id) => {
        labels.add(this.idToLabel[id]);
      });

      if (labels.size < k) {
        k = labels.size;
      }
    }

    let filterFn: (lbl: number) => boolean;
    if (labels.size) {
      filterFn = (lbl: number) => labels.has(lbl);
    }

    // Run query
    const { distances, neighbors } = this._index.searchKnn(query, k, filterFn);

    // Post-process
    return neighbors
      .map((neighborLabel, index) => ({
        id: this.labelToId[neighborLabel],
        distance: distances[index],
        embedding: this._index.getPoint(neighborLabel),
      }))
      .sort((a, b) => a.distance - b.distance);
  }
}
