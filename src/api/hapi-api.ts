import * as Hapi from "@hapi/hapi";
import * as Inert from "@hapi/inert";
import * as Vision from "@hapi/vision";
import { ApiServer } from "../types/api-server";
import { ApiConfig } from "../types/api-config";
import { Logger } from "../types/logger";
import { CollectionRow, CollectionRowMetadata } from "../types/collection-row";
import { Db } from "../types/db";
import { SqliteDb } from "../db/sqlite-db";
import * as Joi from "joi";
import * as Hapiswagger from "hapi-swagger";

export class HapiApi implements ApiServer {
  private _server: Hapi.Server;
  private _db: Db;

  constructor(private apiConfig: ApiConfig, private logger: Logger) {
    this._db = new SqliteDb(apiConfig, logger);

    this._server = Hapi.server({
      port: apiConfig.port,
      host: apiConfig.host,
    });

    this.addBaseRoutes();
    this.addCollectionRoutes();
    this.addEmbeddingRoutes();
  }

  public async start(): Promise<void> {
    await this._server.start();
    this.logger.info(`Server running on ${this._server.info.uri}`);

    // Attach error events to process
    process.on("unhandledRejection", (err) => {
      this.logger.error(err);
      process.exit(1);
    });
  }

  public async stop(): Promise<void> {
    await this._server.stop();
  }

  private async addSwaggerGen() {
    const swaggerOptions = {
      info: {
        title: "Ad-Chromadb API Documentation",
        version: "v1",
      },
    } as const;

    await this._server.register([
      Inert,
      {
        plugin: Vision,
      },
      {
        plugin: Hapiswagger,
        options: swaggerOptions,
      },
    ]);
  }

  private addBaseRoutes() {
    // Add route handles
    this._server.route({
      method: "GET",
      path: "/",
      handler: this.welcome,
    });

    this._server.route({
      method: "GET",
      path: "/api/v1/heartbeat",
      handler: this.heartbeat,
    });

    this._server.route({
      method: "GET",
      path: "/api/v1/collections",
      handler: this.listCollections,
    });
  }

  private addCollectionRoutes() {
    this._server.route({
      method: "GET",
      path: "/api/v1/collections",
      handler: this.listCollections,
    });
    this._server.route({
      method: "POST",
      path: "/api/v1/collections",
      options: {
        validate: {
          payload: Joi.object({
            name: Joi.string().required(),
            metadata: Joi.object({
              numberOfDimensions: Joi.number().positive().integer().min(1),
              maxElements: Joi.number().positive().integer().optional(),
              sizeOfDynamicListOfNearestNeighbors: Joi.number()
                .positive()
                .integer()
                .optional(),
              indexResizeFactor: Joi.number().positive().optional().default(1),
            }),
          }),
        },
      },
      handler: this.createCollection,
    });
  }

  private addEmbeddingRoutes() {
    // ...
  }

  private welcome(
    request: Hapi.Request<Hapi.ReqRefDefaults>,
    h: Hapi.ResponseToolkit<Hapi.ReqRefDefaults>
  ) {
    return h.response("Welcome to Ad-Chroma!").code(200);
  }

  private heartbeat() {
    return {
      db: 1,
    };
  }

  private async listCollections(): Promise<CollectionRow[]> {
    return await this._db.listCollections();
  }

  private async createCollection(
    request: Hapi.Request<Hapi.ReqRefDefaults>,
    h: Hapi.ResponseToolkit<Hapi.ReqRefDefaults>
  ) {
    const { name, metadata } = request.payload as {
      name: string;
      metadata: CollectionRowMetadata;
    };
    return await this._db.createCollection(name, metadata, true);
  }
}
