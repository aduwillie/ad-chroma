export type IndexConfig = {
  id: string;
  persistDirectory: string;
  numberOfDimensions: number;
  maxElements?: number;
  sizeOfDynamicListOfNearestNeighbors?: number;
  indexResizeFactor?: number;
};

export const IndexConfigSchema = {
  id: "string|required",
  persistDirectory: "string|required",
  numberOfDimensions: "number|positive|integer",
  maxElements: "number|positive|integer|optional",
  sizeOfDynamicListOfNearestNeighbors: "number|positive|integer|optional",
  indexResizeFactor: { type: "number", positive: true, default: 1 },
} as const;
