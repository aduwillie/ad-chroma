export type CollectionRow = {
  id: string;
  name: string;
  metadata: string; // Stringified metadata
};

export type CollectionRowMetadata = {
  numberOfDimensions: number;
  maxElements?: number;
  sizeOfDynamicListOfNearestNeighbors?: number;
  indexResizeFactor?: number;
};

export const CollectionRowMetadatachema = {
  numberOfDimensions: "number|positive|integer",
  maxElements: "number|positive|integer|optional",
  sizeOfDynamicListOfNearestNeighbors: "number|positive|integer|optional",
  indexResizeFactor: { type: "number", positive: true, default: 1 },
} as const;
