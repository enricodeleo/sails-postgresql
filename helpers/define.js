//  ██████╗ ███████╗███████╗██╗███╗   ██╗███████╗
//  ██╔══██╗██╔════╝██╔════╝██║████╗  ██║██╔════╝
//  ██║  ██║█████╗  █████╗  ██║██╔██╗ ██║█████╗
//  ██║  ██║██╔══╝  ██╔══╝  ██║██║╚██╗██║██╔══╝
//  ██████╔╝███████╗██║     ██║██║ ╚████║███████╗
//  ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝
//

// Global flag to track if the foreign key application has been scheduled
var _fkApplicationScheduled = false;

module.exports = require("machine").build({
  friendlyName: "Define",

  description: "Create a new table in the database based on a given schema.",

  inputs: {
    datastore: {
      description: "The datastore to use for connections.",
      extendedDescription:
        "Datastores represent the config and manager required to obtain an active database connection.",
      required: true,
      type: "ref",
    },

    tableName: {
      description: "The name of the table to describe.",
      required: true,
      example: "users",
    },

    definition: {
      description: "The definition of the schema to build.",
      required: true,
      example: {},
    },

    meta: {
      friendlyName: "Meta (custom)",
      description: "Additional stuff to pass to the driver.",
      extendedDescription:
        "This is reserved for custom driver-specific extensions.",
      type: "ref",
    },
  },

  exits: {
    success: {
      description: "The table was created successfully.",
    },

    badConnection: {
      friendlyName: "Bad connection",
      description:
        "A connection either could not be obtained or there was an error using the connection.",
    },
  },

  fn: function define(inputs, exits) {
    // Dependencies
    var _ = require("@sailshq/lodash");
    var Helpers = require("./private");

    // Special flag to indicate this is the foreign key application call
    var isFKApplication = inputs.meta && inputs.meta.applyForeignKeys === true;

    // If this is a foreign key application call, handle it separately
    if (isFKApplication) {
      return applyForeignKeys(inputs.datastore, exits);
    }

    // Set a flag if a leased connection from outside the adapter was used or not.
    var leased = _.has(inputs.meta, "leasedConnection");

    //  ╔═╗╦ ╦╔═╗╔═╗╦╔═  ┌─┐┌─┐┬─┐  ┌─┐  ┌─┐┌─┐  ┌─┐┌─┐┬ ┬┌─┐┌┬┐┌─┐
    //  ║  ╠═╣║╣ ║  ╠╩╗  ├┤ │ │├┬┘  ├─┤  ├─┘│ ┬  └─┐│  ├─┤├┤ │││├─┤
    //  ╚═╝╩ ╩╚═╝╚═╝╩ ╩  └  └─┘┴└─  ┴ ┴  ┴  └─┘  └─┘└─┘┴ ┴└─┘┴ ┴┴ ┴
    // This is a unique feature of Postgres. It may be passed in on a query
    // by query basis using the meta input or configured on the datastore. Default
    // to use the public schema.
    var schemaName = "public";
    if (inputs.meta && inputs.meta.schemaName) {
      schemaName = inputs.meta.schemaName;
    } else if (inputs.datastore.config && inputs.datastore.config.schemaName) {
      schemaName = inputs.datastore.config.schemaName;
    }

    //  ╔═╗╔═╗╔═╗╦ ╦╔╗╔  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
    //  ╚═╗╠═╝╠═╣║║║║║║  │  │ │││││││├┤ │   │ ││ ││││
    //  ╚═╝╩  ╩ ╩╚╩╝╝╚╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
    // Spawn a new connection for running queries on.
    Helpers.connection.spawnOrLeaseConnection(
      inputs.datastore,
      inputs.meta,
      function spawnConnectionCb(err, connection) {
        if (err) {
          return exits.badConnection(err);
        }

        //  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┬ ┬┌─┐┌┬┐┌─┐
        //  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   └─┐│  ├─┤├┤ │││├─┤
        //  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  └─┘└─┘┴ ┴└─┘┴ ┴┴ ┴
        //  ┌┐┌┌─┐┌┬┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐  ┌─┐┌─┐  ┌┐┌┌─┐┌─┐┌┬┐┌─┐┌┬┐
        //  │││├─┤│││├┤ └─┐├─┘├─┤│  ├┤   ├─┤└─┐  │││├┤ ├┤  ││├┤  ││
        //  ┘└┘┴ ┴┴ ┴└─┘└─┘┴  ┴ ┴└─┘└─┘  ┴ ┴└─┘  ┘└┘└─┘└─┘─┴┘└─┘─┴┘
        (function createSchemaNamespace(proceed) {
          // If we're being told NOT to create schemas, then skip right to
          // creating the table.
          if (
            inputs.datastore.config &&
            inputs.datastore.config.createSchemas === false
          ) {
            return proceed();
          }

          // Create the schema if needed.
          // If the schema name is "public" there is nothing to create
          if (schemaName === "public") {
            return proceed();
          }

          Helpers.schema.createNamespace(
            {
              datastore: inputs.datastore,
              schemaName: schemaName,
              meta: inputs.meta,
            },
            function createNamespaceCb(err) {
              if (err) {
                return proceed(err);
              }

              return proceed();
            }
          );
        })(function afterNamespaceCreation(err) {
          if (err) {
            // If there was an issue, release the connection
            Helpers.connection.releaseConnection(
              connection,
              leased,
              function releaseConnectionCb() {
                return exits.error(err);
              }
            );
            return;
          }

          // Escape Table Name
          var tableName;
          try {
            tableName = Helpers.schema.escapeTableName(
              inputs.tableName,
              schemaName
            );
          } catch (e) {
            // If there was an issue, release the connection
            Helpers.connection.releaseConnection(
              connection,
              leased,
              function releaseConnectionCb() {
                return exits.error(e);
              }
            );
            return;
          }

          // Process definition to identify foreign keys (for logging purposes only)
          function processForeignKeys(definition, tableName) {
            console.log("PROCESSING FOREIGN KEYS");
            console.log(
              "Note: All foreign keys will be applied in a separate phase"
            );

            // Track foreign key details for logging
            _.forEach(definition, function (attribute, columnName) {
              // Case 1: Explicit foreignKey in meta
              if (attribute.meta && attribute.meta.foreignKey === true) {
                var referencedTable =
                  attribute.meta.references || attribute.model || columnName;
                var referencedColumn = attribute.meta.referencesKey || "id";
                console.log(
                  `Found foreign key: ${columnName} -> ${referencedTable}.${referencedColumn}`
                );
              }
              // Case 2: Implicit via model property
              else if (attribute.model) {
                console.log(
                  `Found foreign key via model property: ${columnName} -> ${attribute.model}.id`
                );
              }
            });

            return definition;
          }

          // Process the definition (for logging only - we don't use the result)
          processForeignKeys(_.cloneDeep(inputs.definition), inputs.tableName);

          // Build schema from the definition - without foreign key constraints
          var schema;
          try {
            schema = Helpers.schema.buildSchema(inputs.definition);
          } catch (e) {
            Helpers.connection.releaseConnection(
              connection,
              leased,
              function releaseConnectionCb() {
                return exits.error(e);
              }
            );
            return;
          }

          // Build Query for table creation
          var createTableQuery =
            "CREATE TABLE IF NOT EXISTS " + tableName + " (" + schema + ")";

          // Run the query to create the table
          Helpers.query.runNativeQuery(
            connection,
            createTableQuery,
            [],
            function (err) {
              if (err) {
                Helpers.connection.releaseConnection(
                  connection,
                  leased,
                  function () {
                    return exits.error(err);
                  }
                );
                return;
              }

              // Build any indexes
              Helpers.schema.buildIndexes(
                {
                  connection: connection,
                  definition: inputs.definition,
                  tableName: inputs.tableName,
                },
                function (err) {
                  if (err) {
                    Helpers.connection.releaseConnection(
                      connection,
                      leased,
                      function () {
                        return exits.error(err);
                      }
                    );
                    return;
                  }

                  // Schedule the foreign key application if not already scheduled
                  if (!_fkApplicationScheduled) {
                    _fkApplicationScheduled = true;

                    // Wait a reasonable amount of time for all tables to be created
                    setTimeout(function () {
                      console.log("SCHEDULING FOREIGN KEY APPLICATION");

                      // Call define with special meta flag to apply foreign keys
                      define(
                        {
                          datastore: inputs.datastore,
                          tableName: "___dummy___",
                          definition: {},
                          meta: { applyForeignKeys: true },
                        },
                        {
                          success: function () {
                            console.log("FOREIGN KEY APPLICATION COMPLETED");
                            _fkApplicationScheduled = false;
                          },
                          error: function (err) {
                            console.error(
                              "FOREIGN KEY APPLICATION FAILED:",
                              err
                            );
                            _fkApplicationScheduled = false;
                          },
                        }
                      );
                    }, 5000); // 5 seconds should be enough for all tables to be created
                  }

                  // Release connection and return success
                  Helpers.connection.releaseConnection(
                    connection,
                    leased,
                    function () {
                      return exits.success();
                    }
                  );
                }
              ); // </ buildIndexes() >
            }
          ); // </ runNativeQuery for table creation >
        }); // </ afterNamespaceCreation >
      }
    ); // </ spawnConnection >
  },
});

// Helper function to apply all foreign keys in a single transaction
function applyForeignKeys(datastore, exits) {
  console.log("APPLYING FOREIGN KEYS");

  var Helpers = require("./private");
  var _ = require("@sailshq/lodash");

  // Spawn a connection to the database
  Helpers.connection.spawnConnection(datastore, function (err, connection) {
    if (err) {
      console.error(
        "Error connecting to database for foreign key application:",
        err
      );
      return exits.error(err);
    }

    // Query the database for all tables
    var tablesQuery =
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'";

    Helpers.query.runNativeQuery(
      connection,
      tablesQuery,
      [],
      function (err, tablesResult) {
        if (err) {
          console.error("Error querying tables:", err);
          Helpers.connection.releaseConnection(connection, false, function () {
            return exits.error(err);
          });
          return;
        }

        // Extract table names
        var tables = [];
        if (tablesResult && tablesResult.rows) {
          tables = tablesResult.rows.map(function (row) {
            return row.tablename;
          });
        }

        console.log("DISCOVERED TABLES:", tables.join(", "));

        if (tables.length === 0) {
          console.log("No tables found, skipping foreign key application");
          Helpers.connection.releaseConnection(connection, false, function () {
            return exits.success();
          });
          return;
        }

        // Collect foreign keys from model definitions
        try {
          var foreignKeys = collectForeignKeys(datastore, tables);

          if (foreignKeys.length === 0) {
            console.log("No foreign keys found to apply");
            Helpers.connection.releaseConnection(
              connection,
              false,
              function () {
                return exits.success();
              }
            );
            return;
          }

          console.log(`COLLECTED ${foreignKeys.length} FOREIGN KEYS TO APPLY`);

          // Start a transaction
          Helpers.query.runNativeQuery(connection, "BEGIN", [], function (err) {
            if (err) {
              console.error("Error starting transaction:", err);
              Helpers.connection.releaseConnection(
                connection,
                false,
                function () {
                  return exits.error(err);
                }
              );
              return;
            }

            // Apply foreign keys one by one
            applyForeignKeysSequentially(
              connection,
              foreignKeys,
              0,
              function (err) {
                if (err) {
                  // Try to rollback
                  Helpers.query.runNativeQuery(
                    connection,
                    "ROLLBACK",
                    [],
                    function () {
                      console.error(
                        "Error applying foreign keys, rolled back:",
                        err
                      );
                      Helpers.connection.releaseConnection(
                        connection,
                        false,
                        function () {
                          return exits.error(err);
                        }
                      );
                    }
                  );
                  return;
                }

                // Commit transaction
                Helpers.query.runNativeQuery(
                  connection,
                  "COMMIT",
                  [],
                  function (err) {
                    if (err) {
                      console.error("Error committing transaction:", err);
                      Helpers.connection.releaseConnection(
                        connection,
                        false,
                        function () {
                          return exits.error(err);
                        }
                      );
                      return;
                    }

                    console.log("SUCCESSFULLY APPLIED FOREIGN KEYS");
                    Helpers.connection.releaseConnection(
                      connection,
                      false,
                      function () {
                        return exits.success();
                      }
                    );
                  }
                );
              }
            );
          });
        } catch (e) {
          console.error("Error in foreign key collection:", e);
          Helpers.connection.releaseConnection(connection, false, function () {
            return exits.error(e);
          });
        }
      }
    );
  });
}

// Apply foreign keys one by one
function applyForeignKeysSequentially(connection, foreignKeys, index, cb) {
  var Helpers = require("./private");

  if (index >= foreignKeys.length) {
    return cb();
  }

  var fk = foreignKeys[index];
  console.log(
    `Applying foreign key [${index + 1}/${foreignKeys.length}]: ${fk.query}`
  );

  Helpers.query.runNativeQuery(connection, fk.query, [], function (err) {
    if (err) {
      console.error(
        `Error applying foreign key ${fk.sourceTable}.${fk.sourceColumn} -> ${fk.targetTable}.${fk.targetColumn}:`,
        err.message
      );
      // Continue with next foreign key rather than aborting
    }

    // Process next foreign key
    applyForeignKeysSequentially(connection, foreignKeys, index + 1, cb);
  });
}

// Collect foreign keys from all models
function collectForeignKeys(datastore, tables) {
  var foreignKeys = [];
  var _ = require("@sailshq/lodash");

  // Get all models from the datastore's model definitions
  var models = datastore.collections || {};

  // Process each model
  _.each(models, function (model, modelName) {
    var tableName = model.tableName || modelName;

    // Skip if table doesn't exist
    if (!tables.includes(tableName)) {
      return;
    }

    // Process each attribute for foreign keys
    _.each(model.attributes, function (attribute, attrName) {
      // Skip primary keys and timestamps
      if (
        attrName === "id" ||
        attrName === "createdAt" ||
        attrName === "updatedAt"
      ) {
        return;
      }

      // Case 1: Explicit foreign key
      if (attribute.meta && attribute.meta.foreignKey === true) {
        var targetTable =
          attribute.meta.references || attribute.model || attrName;
        var targetColumn = attribute.meta.referencesKey || "id";

        // Skip if target table doesn't exist
        if (!tables.includes(targetTable)) {
          console.log(
            `Skipping FK ${tableName}.${attrName} -> ${targetTable}.${targetColumn} (target table doesn't exist)`
          );
          return;
        }

        // Build ON DELETE/UPDATE behavior
        var onDelete = attribute.meta.onDelete
          ? ` ON DELETE ${attribute.meta.onDelete.toUpperCase()}`
          : " ON DELETE RESTRICT";
        var onUpdate = attribute.meta.onUpdate
          ? ` ON UPDATE ${attribute.meta.onUpdate.toUpperCase()}`
          : " ON UPDATE CASCADE";

        // Build constraint
        var constraintName = `fk_${tableName}_${attrName}_${targetTable}`;
        var query = `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${attrName}") REFERENCES "${targetTable}" ("${targetColumn}")${onDelete}${onUpdate}`;

        foreignKeys.push({
          sourceTable: tableName,
          sourceColumn: attrName,
          targetTable: targetTable,
          targetColumn: targetColumn,
          query: query,
        });
      }
      // Case 2: Implicit via model property
      else if (attribute.model) {
        var targetTable = attribute.model;

        // Skip if target table doesn't exist
        if (!tables.includes(targetTable)) {
          console.log(
            `Skipping FK ${tableName}.${attrName} -> ${targetTable}.id (target table doesn't exist)`
          );
          return;
        }

        // Build constraint
        var constraintName = `fk_${tableName}_${attrName}_${targetTable}`;
        var query = `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${attrName}") REFERENCES "${targetTable}" ("id") ON DELETE RESTRICT ON UPDATE CASCADE`;

        foreignKeys.push({
          sourceTable: tableName,
          sourceColumn: attrName,
          targetTable: targetTable,
          targetColumn: "id",
          query: query,
        });
      }
      // Case 3: Detect by naming convention
      else if (
        attrName.toLowerCase().endsWith("id") &&
        attrName.toLowerCase() !== "id"
      ) {
        var targetTable = attrName.slice(0, -2).toLowerCase();

        // Skip if target table doesn't exist or is self-referencing
        if (!tables.includes(targetTable) || targetTable === tableName) {
          return;
        }

        // Build constraint
        var constraintName = `fk_${tableName}_${attrName}_${targetTable}`;
        var query = `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${attrName}") REFERENCES "${targetTable}" ("id") ON DELETE RESTRICT ON UPDATE CASCADE`;

        foreignKeys.push({
          sourceTable: tableName,
          sourceColumn: attrName,
          targetTable: targetTable,
          targetColumn: "id",
          query: query,
        });
      }
    });
  });

  return foreignKeys;
}
