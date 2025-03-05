//  ███████╗ █████╗ ██╗██╗     ███████╗
//  ██╔════╝██╔══██╗██║██║     ██╔════╝
//  ███████╗███████║██║██║     ███████╗
//  ╚════██║██╔══██║██║██║     ╚════██║
//  ███████║██║  ██║██║███████╗███████║
//  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝
//
//  ██████╗  ██████╗ ███████╗████████╗ ██████╗ ██████╗ ███████╗███████╗ ██████╗ ██╗
//  ██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝██╔════╝ ██╔══██╗██╔════╝██╔════╝██╔═══██╗██║
//  ██████╔╝██║   ██║███████╗   ██║   ██║  ███╗██████╔╝█████╗  ███████╗██║   ██║██║
//  ██╔═══╝ ██║   ██║╚════██║   ██║   ██║   ██║██╔══██╗██╔══╝  ╚════██║██║▄▄ ██║██║
//  ██║     ╚██████╔╝███████║   ██║   ╚██████╔╝██║  ██║███████╗███████║╚██████╔╝███████╗
//  ╚═╝      ╚═════╝ ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝ ╚══▀▀═╝ ╚══════╝
//
// An adapter for PostgreSQL and Waterline

var _ = require('@sailshq/lodash');
var async = require('async');
var redactPasswords = require('./private/redact-passwords');
var Helpers = require('../helpers');

module.exports = (function sailsPostgresql() {
  // Keep track of all the datastores used by the app
  var datastores = {};

  // Keep track of all the connection model definitions
  var modelDefinitions = {};

  var adapter = {
    identity: 'sails-postgresql',

    // Waterline Adapter API Version
    adapterApiVersion: 1,


    //  ╔═╗═╗ ╦╔═╗╔═╗╔═╗╔═╗  ┌─┐┬─┐┬┬  ┬┌─┐┌┬┐┌─┐
    //  ║╣ ╔╩╦╝╠═╝║ ║╚═╗║╣   ├─┘├┬┘│└┐┌┘├─┤ │ ├┤
    //  ╚═╝╩ ╚═╩  ╚═╝╚═╝╚═╝  ┴  ┴└─┴ └┘ ┴ ┴ ┴ └─┘
    //  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐┌─┐
    //   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤ └─┐
    //  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘└─┘
    // This allows outside access to the connection manager.
    datastores: datastores,


    //  ╦═╗╔═╗╔═╗╦╔═╗╔╦╗╔═╗╦═╗  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
    //  ╠╦╝║╣ ║ ╦║╚═╗ ║ ║╣ ╠╦╝   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤
    //  ╩╚═╚═╝╚═╝╩╚═╝ ╩ ╚═╝╩╚═  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘
    // Register a datastore config and generate a connection manager for it.
    registerDatastore: function registerDatastore(datastoreConfig, models, cb) {
      var identity = datastoreConfig.identity;
      if (!identity) {
        return cb(new Error('Invalid datastore config. A datastore should contain a unique identity property.'));
      }

      console.log('FOREIGN KEYS: Starting datastore registration for:', identity);
      
      try {
        // Check if any models have foreign key relationships
        var hasForeignKeys = false;
        _.each(models, function(model) {
          _.each(model.schema, function(attribute, attrName) {
            if (attribute.model && attribute.meta && attribute.meta.foreignKey === true) {
              hasForeignKeys = true;
              console.log('FOREIGN KEYS: Found foreign key in model:', model.tableName || model.identity, 
                          'attribute:', attrName, 'referencing:', attribute.model);
            }
          });
        });
        
        // Register the datastore
        Helpers.registerDataStore({
          identity: identity,
          config: datastoreConfig,
          models: models,
          datastores: datastores,
          modelDefinitions: modelDefinitions
        }).execSync();
        
        // If we have foreign keys, analyze dependencies
        if (hasForeignKeys) {
          console.log('FOREIGN KEYS: Analyzing dependencies for datastore:', identity);
          
          // Debug model structure
          _.each(models, function(model, modelName) {
            console.log('FOREIGN KEYS: Model structure for', modelName + ':', 
                        'tableName =', model.tableName || modelName,
                        'schema keys =', Object.keys(model.schema || {}));
          });
          
          var dependencyInfo = Helpers.schema.analyzeDependencies(models);
          
          // Store the dependency info in the datastore for later use
          datastores[identity].dependencyInfo = dependencyInfo;
          
          console.log('FOREIGN KEYS: Dependency analysis complete for datastore:', identity);
        }
      } catch (e) {
        console.error('FOREIGN KEYS: Error during datastore registration:', e.message);
        setImmediate(function done() {
          return cb(redactPasswords(e));
        });
        return;
      }

      setImmediate(function done() {
        console.log('FOREIGN KEYS: Datastore registration complete for:', identity);
        return cb();
      });
    },


    //  ╔╦╗╔═╗╔═╗╦═╗╔╦╗╔═╗╦ ╦╔╗╔  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
    //   ║ ║╣ ╠═╣╠╦╝ ║║║ ║║║║║║║  │  │ │││││││├┤ │   │ ││ ││││
    //   ╩ ╚═╝╩ ╩╩╚══╩╝╚═╝╚╩╝╝╚╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
    // Destroy a manager and close any connections in it's pool.
    teardown: function teardown(identity, cb) {
      var datastoreIdentities = [];

      // If no specific identity was sent, teardown all the datastores
      if (!identity || identity === null) {
        datastoreIdentities = datastoreIdentities.concat(_.keys(datastores));
      } else {
        datastoreIdentities.push(identity);
      }

      // Teardown each datastore identity manager
      async.eachSeries(datastoreIdentities, function teardownDatastore(datastoreIdentity, next) {
        Helpers.teardown({
          identity: datastoreIdentity,
          datastores: datastores,
          modelDefinitions: modelDefinitions
        }).switch({
          error: function error(err) {
            return next(redactPasswords(err));
          },
          success: function success() {
            return next();
          }
        });
      }, function asyncCb(err) {
        cb(redactPasswords(err));
      });
    },


    //  ██████╗  ██████╗ ██╗
    //  ██╔══██╗██╔═══██╗██║
    //  ██║  ██║██║   ██║██║
    //  ██║  ██║██║▄▄ ██║██║
    //  ██████╔╝╚██████╔╝███████╗
    //  ╚═════╝  ╚══▀▀═╝ ╚══════╝
    //
    // Methods related to manipulating data stored in the database.


    //  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ┬─┐┌─┐┌─┐┌─┐┬─┐┌┬┐
    //  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   ├┬┘├┤ │  │ │├┬┘ ││
    //  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ┴└─└─┘└─┘└─┘┴└──┴┘
    // Add a new row to the table
    create: function create(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.create({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        notUnique: function error(errInfo) {
          var e = new Error(errInfo.message);
          e.footprint = errInfo.footprint;
          return cb(redactPasswords(e));
        },
        success: function success(report) {
          var record = report && report.record || undefined;
          return cb(undefined, record);
        }
      });
    },


    //  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ╔═╗╔═╗╔═╗╦ ╦  ┬─┐┌─┐┌─┐┌─┐┬─┐┌┬┐
    //  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   ║╣ ╠═╣║  ╠═╣  ├┬┘├┤ │  │ │├┬┘ ││
    //  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ╚═╝╩ ╩╚═╝╩ ╩  ┴└─└─┘└─┘└─┘┴└──┴┘
    // Add multiple new rows to the table
    createEach: function createEach(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.createEach({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        notUnique: function error(errInfo) {
          var e = new Error(errInfo.message);
          e.footprint = errInfo.footprint;
          return cb(redactPasswords(e));
        },
        success: function success(report) {
          var records = report && report.records || undefined;
          return cb(undefined, records);
        }
      });
    },


    //  ╔═╗╔═╗╦  ╔═╗╔═╗╔╦╗  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
    //  ╚═╗║╣ ║  ║╣ ║   ║   │─┼┐│ │├┤ ├┬┘└┬┘
    //  ╚═╝╚═╝╩═╝╚═╝╚═╝ ╩   └─┘└└─┘└─┘┴└─ ┴
    // Select Query Logic
    find: function find(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.select({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success(report) {
          return cb(undefined, report.records);
        }
      });
    },


    //  ╦ ╦╔═╗╔╦╗╔═╗╔╦╗╔═╗  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
    //  ║ ║╠═╝ ║║╠═╣ ║ ║╣   │─┼┐│ │├┤ ├┬┘└┬┘
    //  ╚═╝╩  ═╩╝╩ ╩ ╩ ╚═╝  └─┘└└─┘└─┘┴└─ ┴
    // Update one or more models in the table
    update: function update(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.update({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        notUnique: function error(errInfo) {
          var e = new Error(errInfo.message);
          e.footprint = errInfo.footprint;
          return cb(redactPasswords(e));
        },
        success: function success(report) {
          if (report) {
            return cb(undefined, report.records);
          }

          return cb();
        }
      });
    },


    //  ╔╦╗╔═╗╔═╗╔╦╗╦═╗╔═╗╦ ╦  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
    //   ║║║╣ ╚═╗ ║ ╠╦╝║ ║╚╦╝  │─┼┐│ │├┤ ├┬┘└┬┘
    //  ═╩╝╚═╝╚═╝ ╩ ╩╚═╚═╝ ╩   └─┘└└─┘└─┘┴└─ ┴
    // Delete one or more records in a table
    destroy: function destroy(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.destroy({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success(report) {
          if (report) {
            return cb(undefined, report.records);
          }

          return cb();
        }
      });
    },


    //  ╔╗╔╔═╗╔╦╗╦╦  ╦╔═╗   ┬┌─┐┬┌┐┌  ┌─┐┬ ┬┌─┐┌─┐┌─┐┬─┐┌┬┐
    //  ║║║╠═╣ ║ ║╚╗╔╝║╣    ││ │││││  └─┐│ │├─┘├─┘│ │├┬┘ │
    //  ╝╚╝╩ ╩ ╩ ╩ ╚╝ ╚═╝  └┘└─┘┴┘└┘  └─┘└─┘┴  ┴  └─┘┴└─ ┴
    // Build up native joins to run on the adapter.
    join: function join(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.join({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success(report) {
          return cb(undefined, report);
        }
      });
    },


    //  ╔═╗╦  ╦╔═╗  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
    //  ╠═╣╚╗╔╝║ ╦  │─┼┐│ │├┤ ├┬┘└┬┘
    //  ╩ ╩ ╚╝ ╚═╝  └─┘└└─┘└─┘┴└─ ┴
    // Find out the average of the query.
    avg: function avg(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.avg({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success(report) {
          return cb(undefined, report);
        }
      });
    },


    //  ╔═╗╦ ╦╔╦╗  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
    //  ╚═╗║ ║║║║  │─┼┐│ │├┤ ├┬┘└┬┘
    //  ╚═╝╚═╝╩ ╩  └─┘└└─┘└─┘┴└─ ┴
    // Find out the sum of the query.
    sum: function sum(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.sum({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success(report) {
          return cb(undefined, report);
        }
      });
    },


    //  ╔═╗╔═╗╦ ╦╔╗╔╔╦╗  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
    //  ║  ║ ║║ ║║║║ ║   │─┼┐│ │├┤ ├┬┘└┬┘
    //  ╚═╝╚═╝╚═╝╝╚╝ ╩   └─┘└└─┘└─┘┴└─ ┴
    // Return the number of matching records.
    count: function count(datastoreName, query, cb) {
      var datastore = datastores[datastoreName];
      var models = modelDefinitions[datastoreName];
      Helpers.count({
        datastore: datastore,
        models: models,
        query: query
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success(report) {
          return cb(undefined, report);
        }
      });
    },


    //  ██████╗ ██████╗ ██╗
    //  ██╔══██╗██╔══██╗██║
    //  ██║  ██║██║  ██║██║
    //  ██║  ██║██║  ██║██║
    //  ██████╔╝██████╔╝███████╗
    //  ╚═════╝ ╚═════╝ ╚══════╝
    //
    // Methods related to modifying the underlying data structure of the
    // database.


    //  ╔╦╗╔═╗╔═╗╔═╗╦═╗╦╔╗ ╔═╗  ┌┬┐┌─┐┌┐ ┬  ┌─┐
    //   ║║║╣ ╚═╗║  ╠╦╝║╠╩╗║╣    │ ├─┤├┴┐│  ├┤
    //  ═╩╝╚═╝╚═╝╚═╝╩╚═╩╚═╝╚═╝   ┴ ┴ ┴└─┘┴─┘└─┘
    // Describe a table and get back a normalized model schema format.
    // (This is used to allow Sails to do auto-migrations)
    describe: function describe(datastoreName, tableName, cb, meta) {
      var datastore = datastores[datastoreName];
      Helpers.describe({
        datastore: datastore,
        tableName: tableName,
        meta: meta
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success(report) {
          // Waterline expects the result to be undefined if the table doesn't
          // exist.
          if (_.keys(report.schema).length) {
            return cb(undefined, report.schema);
          }

          return cb();
        }
      });
    },


    //  ╔╦╗╔═╗╔═╗╦╔╗╔╔═╗  ┌┬┐┌─┐┌┐ ┬  ┌─┐
    //   ║║║╣ ╠╣ ║║║║║╣    │ ├─┤├┴┐│  ├┤
    //  ═╩╝╚═╝╚  ╩╝╚╝╚═╝   ┴ ┴ ┴└─┘┴─┘└─┘
    // Build a new table in the database.
    // (This is used to allow Sails to do auto-migrations)
    define: function define(datastoreName, tableName, definition, cb, meta) {
      var datastore = datastores[datastoreName];
      
      // Check if we need to handle foreign keys
      var handleForeignKeys = false;
      var foreignKeys = [];
      var postCreateForeignKeys = [];
      
      // If we have dependency info, process foreign keys
      if (datastore.dependencyInfo && datastore.dependencyInfo.foreignKeys) {
        console.log('FOREIGN KEYS: Processing foreign keys for table:', tableName);
        console.log('FOREIGN KEYS: Available foreign key tables:', Object.keys(datastore.dependencyInfo.foreignKeys));
        
        // Get foreign keys for this table
        var tableKeys = datastore.dependencyInfo.foreignKeys[tableName];
        if (tableKeys && tableKeys.length > 0) {
          handleForeignKeys = true;
          
          console.log('FOREIGN KEYS: Found', tableKeys.length, 'foreign keys for table:', tableName);
          
          // Process each foreign key
          _.each(tableKeys, function(fk) {
            // Check if this is a self-reference or circular dependency
            if (fk.references === tableName) {
              // Add to post-create foreign keys
              console.log('FOREIGN KEYS: Self-reference detected, will add after table creation:', 
                          tableName, '->', fk.references);
              postCreateForeignKeys.push(fk);
            } else {
              // Add to regular foreign keys
              console.log('FOREIGN KEYS: Adding foreign key during table creation:', 
                          tableName, '->', fk.references);
              foreignKeys.push(fk);
            }
          });
        } else {
          console.log('FOREIGN KEYS: No foreign keys found for table:', tableName);
        }
      }
      
      // Add foreign key metadata if needed
      var metaWithFK = meta || {};
      if (handleForeignKeys) {
        metaWithFK.foreignKeys = foreignKeys;
        if (postCreateForeignKeys.length > 0) {
          metaWithFK.postCreateForeignKeys = postCreateForeignKeys;
        }
      }
      
      Helpers.define({
        datastore: datastore,
        tableName: tableName,
        definition: definition,
        meta: metaWithFK
      }).switch({
        error: function error(err) {
          console.error('FOREIGN KEYS: Error defining table:', tableName, err);
          return cb(redactPasswords(err));
        },
        success: function success() {
          console.log('FOREIGN KEYS: Successfully defined table:', tableName);
          return cb();
        }
      });
    },


    //  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┬ ┬┌─┐┌┬┐┌─┐
    //  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   └─┐│  ├─┤├┤ │││├─┤
    //  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  └─┘└─┘┴ ┴└─┘┴ ┴┴ ┴
    // Create a new Postgres Schema (namespace) in the database.
    createSchema: function createSchema(datastoreName, schemaName, cb, meta) {
      var datastore = datastores[datastoreName];
      Helpers.createSchema({
        datastore: datastore,
        schemaName: schemaName,
        meta: meta
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success() {
          return cb();
        }
      });
    },


    //  ╔╦╗╦═╗╔═╗╔═╗  ┌┬┐┌─┐┌┐ ┬  ┌─┐
    //   ║║╠╦╝║ ║╠═╝   │ ├─┤├┴┐│  ├┤
    //  ═╩╝╩╚═╚═╝╩     ┴ ┴ ┴└─┘┴─┘└─┘
    // Remove a table from the database.
    drop: function drop(datastoreName, tableName, relations, cb, meta) {
      var datastore = datastores[datastoreName];
      Helpers.drop({
        datastore: datastore,
        tableName: tableName,
        meta: meta
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        badConnection: function badConnection(err) {
          return cb(redactPasswords(err));
        },
        success: function success() {
          return cb();
        }
      });
    },


    //  ╔═╗╔═╗╔╦╗  ┌─┐┌─┐┌─┐ ┬ ┬┌─┐┌┐┌┌─┐┌─┐
    //  ╚═╗║╣  ║   └─┐├┤ │─┼┐│ │├┤ ││││  ├┤
    //  ╚═╝╚═╝ ╩   └─┘└─┘└─┘└└─┘└─┘┘└┘└─┘└─┘
    // Set a sequence in an auto-incrementing primary key to a known value.
    setSequence: function setSequence(datastoreName, sequenceName, sequenceValue, cb, meta) {
      var datastore = datastores[datastoreName];
      Helpers.setSequence({
        datastore: datastore,
        sequenceName: sequenceName,
        sequenceValue: sequenceValue,
        meta: meta
      }).switch({
        error: function error(err) {
          return cb(redactPasswords(err));
        },
        success: function success() {
          return cb();
        }
      });
    },

  };

  return adapter;
})();


