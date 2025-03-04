//  ██████╗ ███████╗███████╗██╗███╗   ██╗███████╗
//  ██╔══██╗██╔════╝██╔════╝██║████╗  ██║██╔════╝
//  ██║  ██║█████╗  █████╗  ██║██╔██╗ ██║█████╗
//  ██║  ██║██╔══╝  ██╔══╝  ██║██║╚██╗██║██╔══╝
//  ██████╔╝███████╗██║     ██║██║ ╚████║███████╗
//  ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝
//

module.exports = require('machine').build({


  friendlyName: 'Define',


  description: 'Create a new table in the database based on a given schema.',


  inputs: {

    datastore: {
      description: 'The datastore to use for connections.',
      extendedDescription: 'Datastores represent the config and manager required to obtain an active database connection.',
      required: true,
      type: 'ref'
    },

    tableName: {
      description: 'The name of the table to describe.',
      required: true,
      example: 'users'
    },

    definition: {
      description: 'The definition of the schema to build.',
      required: true,
      example: {}
    },

    meta: {
      friendlyName: 'Meta (custom)',
      description: 'Additional stuff to pass to the driver.',
      extendedDescription: 'This is reserved for custom driver-specific extensions.',
      type: 'ref'
    }

  },


  exits: {

    success: {
      description: 'The table was created successfully.'
    },

    badConnection: {
      friendlyName: 'Bad connection',
      description: 'A connection either could not be obtained or there was an error using the connection.'
    }

  },


  fn: function define(inputs, exits) {
    // Dependencies
    var _ = require('@sailshq/lodash');
    var Helpers = require('./private');


    // Set a flag if a leased connection from outside the adapter was used or not.
    var leased = _.has(inputs.meta, 'leasedConnection');


    //  ╔═╗╦ ╦╔═╗╔═╗╦╔═  ┌─┐┌─┐┬─┐  ┌─┐  ┌─┐┌─┐  ┌─┐┌─┐┬ ┬┌─┐┌┬┐┌─┐
    //  ║  ╠═╣║╣ ║  ╠╩╗  ├┤ │ │├┬┘  ├─┤  ├─┘│ ┬  └─┐│  ├─┤├┤ │││├─┤
    //  ╚═╝╩ ╩╚═╝╚═╝╩ ╩  └  └─┘┴└─  ┴ ┴  ┴  └─┘  └─┘└─┘┴ ┴└─┘┴ ┴┴ ┴
    // This is a unique feature of Postgres. It may be passed in on a query
    // by query basis using the meta input or configured on the datastore. Default
    // to use the public schema.
    var schemaName = 'public';
    if (inputs.meta && inputs.meta.schemaName) {
      schemaName = inputs.meta.schemaName;
    } else if (inputs.datastore.config && inputs.datastore.config.schemaName) {
      schemaName = inputs.datastore.config.schemaName;
    }


    //  ╔═╗╔═╗╔═╗╦ ╦╔╗╔  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
    //  ╚═╗╠═╝╠═╣║║║║║║  │  │ │││││││├┤ │   │ ││ ││││
    //  ╚═╝╩  ╩ ╩╚╩╝╝╚╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
    // Spawn a new connection for running queries on.
    Helpers.connection.spawnOrLeaseConnection(inputs.datastore, inputs.meta, function spawnConnectionCb(err, connection) {
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
        if (inputs.datastore.config && inputs.datastore.config.createSchemas === false) {
          return proceed();
        }

        // Create the schema if needed.
        // If the schema name is "public" there is nothing to create
        if (schemaName === 'public') {
          return proceed();
        }

        Helpers.schema.createNamespace({
          datastore: inputs.datastore,
          schemaName: schemaName,
          meta: inputs.meta,
        }, function createNamespaceCb(err) {
          if (err) {
            return proceed(err);
          }

          return proceed();
        });
      })(function afterNamespaceCreation(err) {
        if (err) {
          // If there was an issue, release the connection
          Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
            return exits.error(err);
          });
          return;
        }

        // Escape Table Name
        var tableName;
        try {
          tableName = Helpers.schema.escapeTableName(inputs.tableName, schemaName);
        } catch (e) {
          // If there was an issue, release the connection
          Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
            return exits.error(e);
          });
          return;
        }


        //  ╔╗ ╦ ╦╦╦  ╔╦╗  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬  ┌─┐┌┬┐┬─┐┬┌┐┌┌─┐
        //  ╠╩╗║ ║║║   ║║  │─┼┐│ │├┤ ├┬┘└┬┘  └─┐ │ ├┬┘│││││ ┬
        //  ╚═╝╚═╝╩╩═╝═╩╝  └─┘└└─┘└─┘┴└─ ┴   └─┘ ┴ ┴└─┴┘└┘└─┘

        // Iterate through each attribute, building a query string
        var schema;
        var processedDefinition;
        try {
          processedDefinition = Helpers.schema.processForeignKeys(inputs.definition, inputs.tableName);
          schema = Helpers.schema.buildSchema(processedDefinition);
        } catch (e) {
          // If there was an issue, release the connection
          Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
            return exits.error(e);
          });
          return;
        }

        // Build Query
        var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (' + schema + ')';


        //  ╦═╗╦ ╦╔╗╔  ┌─┐┬─┐┌─┐┌─┐┌┬┐┌─┐  ┌┬┐┌─┐┌┐ ┬  ┌─┐
        //  ╠╦╝║ ║║║║  │  ├┬┘├┤ ├─┤ │ ├┤    │ ├─┤├┴┐│  ├┤
        //  ╩╚═╚═╝╝╚╝  └─┘┴└─└─┘┴ ┴ ┴ └─┘   ┴ ┴ ┴└─┘┴─┘└─┘
        //  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
        //  │─┼┐│ │├┤ ├┬┘└┬┘
        //  └─┘└└─┘└─┘┴└─ ┴
        Helpers.query.runNativeQuery(connection, query, [], function runNativeQueryCb(err) {
          if (err) {
            // If there was an issue, release the connection
            Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
              return exits.error(err);
            });
            return;
          }

          // Register this table as created in our registry
          if (global._tableRegistry) {
            global._tableRegistry.registerTable(inputs.tableName);
            console.log(`Registered table ${inputs.tableName} as created`);
          }

          //  ╔╗ ╦ ╦╦╦  ╔╦╗  ┬┌┐┌┌┬┐┌─┐─┐ ┬┌─┐┌─┐
          //  ╠╩╗║ ║║║   ║║  ││││ ││├┤ ┌┴┬┘├┤ └─┐
          //  ╚═╝╚═╝╩╩═╝═╩╝  ┴┘└┘─┴┘└─┘┴ └─└─┘└─┘
          // Build any indexes
          Helpers.schema.buildIndexes({
            connection: connection,
            definition: inputs.definition,
            tableName: inputs.tableName
          },
          function buildIndexesCb(err) {
            if (err) {
              Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
                return exits.error(err);
              });
              return;
            }

            // Check if there are any deferred foreign key constraints to add
            if (processedDefinition._deferredForeignKeys && processedDefinition._deferredForeignKeys.length > 0) {
              console.log(`Processing ${processedDefinition._deferredForeignKeys.length} deferred foreign key constraints for ${inputs.tableName}`);
              
              // Create a function to add deferred constraints one by one
              var addDeferredConstraints = function(constraints, idx, cb) {
                if (idx >= constraints.length) {
                  return cb();
                }
                
                var constraint = constraints[idx];
                
                // Check if the referenced table exists now
                if (!global._tableRegistry.tableExists(constraint.referencedTable)) {
                  console.log(`Still can't add foreign key to ${constraint.referencedTable}, table doesn't exist yet`);
                  return addDeferredConstraints(constraints, idx + 1, cb);
                }
                
                // Add the constraint
                var alterQuery = `ALTER TABLE ${tableName} ADD ${constraint.constraint}`;
                console.log(`Adding deferred constraint: ${alterQuery}`);
                
                Helpers.query.runNativeQuery(connection, alterQuery, [], function(alterErr) {
                  if (alterErr) {
                    console.log(`Error adding deferred constraint: ${alterErr.message}`);
                    // Log more details about the error
                    if (alterErr.code) {
                      console.log(`Error code: ${alterErr.code}`);
                    }
                    if (alterErr.detail) {
                      console.log(`Error detail: ${alterErr.detail}`);
                    }
                    if (alterErr.hint) {
                      console.log(`Error hint: ${alterErr.hint}`);
                    }
                    
                    // If the error is because the constraint already exists, we can ignore it
                    if (alterErr.code === '42710') { // duplicate_object
                      console.log(`Constraint already exists, continuing...`);
                    }
                    // If the error is because the referenced table doesn't exist, mark it for retry
                    else if (alterErr.code === '42P01') { // undefined_table
                      console.log(`Referenced table doesn't exist yet, will retry later`);
                      constraint._retryLater = true;
                    }
                  } else {
                    console.log(`Successfully added deferred constraint to ${constraint.referencedTable}`);
                  }
                  
                  // Continue with next constraint regardless of error
                  return addDeferredConstraints(constraints, idx + 1, cb);
                });
              };
              
              // Start adding deferred constraints
              addDeferredConstraints(processedDefinition._deferredForeignKeys, 0, function() {
                // Check if any constraints need to be retried later
                var retryConstraints = processedDefinition._deferredForeignKeys.filter(function(constraint) {
                  return constraint._retryLater === true;
                });
                
                if (retryConstraints.length > 0) {
                  console.log(`${retryConstraints.length} constraints need to be retried later`);
                  // Store these constraints in the global registry for later processing
                  if (!global._tableRegistry.deferredConstraints) {
                    global._tableRegistry.deferredConstraints = [];
                  }
                  
                  // Add these constraints to the global registry
                  retryConstraints.forEach(function(constraint) {
                    global._tableRegistry.deferredConstraints.push({
                      tableName: tableName,
                      constraint: constraint
                    });
                  });
                }
                
                Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
                  return exits.success();
                });
              });
            } else {
              // Check if there are any global deferred constraints that reference this table
              if (global._tableRegistry.deferredConstraints && global._tableRegistry.deferredConstraints.length > 0) {
                // Filter constraints that can now be applied because this table was just created
                var applicableConstraints = global._tableRegistry.deferredConstraints.filter(function(item) {
                  return item.constraint.referencedTable === inputs.tableName;
                });
                
                if (applicableConstraints.length > 0) {
                  console.log(`Found ${applicableConstraints.length} deferred constraints that can now be applied because ${inputs.tableName} was created`);
                  
                  // Process these constraints
                  var processConstraints = function(constraintItems, idx, cb) {
                    if (idx >= constraintItems.length) {
                      return cb();
                    }
                    
                    var item = constraintItems[idx];
                    var alterQuery = `ALTER TABLE "${item.tableName}" ADD ${item.constraint.constraint}`;
                    console.log(`Adding previously deferred constraint: ${alterQuery}`);
                    
                    Helpers.query.runNativeQuery(connection, alterQuery, [], function(alterErr) {
                      if (alterErr) {
                        console.log(`Error adding previously deferred constraint: ${alterErr.message}`);
                        if (alterErr.code) {
                          console.log(`Error code: ${alterErr.code}`);
                        }
                      } else {
                        console.log(`Successfully added previously deferred constraint`);
                        
                        // Remove this constraint from the global registry
                        global._tableRegistry.deferredConstraints = global._tableRegistry.deferredConstraints.filter(function(c) {
                          return c !== item;
                        });
                      }
                      
                      // Continue with next constraint
                      return processConstraints(constraintItems, idx + 1, cb);
                    });
                  };
                  
                  // Process the applicable constraints
                  processConstraints(applicableConstraints, 0, function() {
                    Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
                      return exits.success();
                    });
                  });
                } else {
                  Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
                    return exits.success();
                  });
                }
              } else {
                Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
                  return exits.success();
                });
              }
            }
          }); // </ buildIndexes() >
        }); // </ runNativeQuery >
      }); // </ afterNamespaceCreation >
    }); // </ spawnConnection >
  }
});
