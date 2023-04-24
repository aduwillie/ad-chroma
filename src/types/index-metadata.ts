import { SpaceName } from "hnswlib-node"

export type IndexMetadata = {
  dimensionality: SpaceName,
  elements: number;
  timeCreated: number;
};
