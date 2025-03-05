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
    var async = require('async');


    // Set a flag if a leased connection from outside the adapter was used or not.
    var leased = _.has(inputs.meta, 'leasedConnection');
    
    // Check if we need to handle foreign keys
    var handleForeignKeys = false;
    if (inputs.meta && inputs.meta.foreignKeys) {
      handleForeignKeys = true;
      console.log('FOREIGN KEYS: Foreign keys detected for table:', inputs.tableName);
      console.log('FOREIGN KEYS: Foreign key metadata:', JSON.stringify(inputs.meta.foreignKeys, null, 2));
    }


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
        try {
          // If we have foreign keys, add them to the definition metadata
          if (handleForeignKeys && inputs.meta.foreignKeys) {
            console.log('FOREIGN KEYS: Adding foreign key constraints to schema for table:', inputs.tableName);
            // Create a copy of the definition with the foreign key metadata
            var definitionWithFK = _.cloneDeep(inputs.definition);
            definitionWithFK._meta = definitionWithFK._meta || {};
            definitionWithFK._meta.foreignKeys = inputs.meta.foreignKeys;
            schema = Helpers.schema.buildSchema(definitionWithFK);
          } else {
            schema = Helpers.schema.buildSchema(inputs.definition);
          }
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
            
            // If we don't need to handle post-creation foreign keys, we're done
            if (!handleForeignKeys || !inputs.meta.postCreateForeignKeys) {
              console.log('FOREIGN KEYS: No post-creation foreign keys needed for table:', inputs.tableName);
              Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
                return exits.success();
              });
              return;
            }
            
            console.log('FOREIGN KEYS: Adding post-creation foreign keys for table:', inputs.tableName);
            console.log('FOREIGN KEYS: Post-creation foreign keys:', JSON.stringify(inputs.meta.postCreateForeignKeys, null, 2));
            
            // Add any foreign key constraints that couldn't be added during table creation
            // (like self-referencing tables or circular dependencies)
            Helpers.schema.addForeignKeys({
              connection: connection,
              tableName: inputs.tableName,
              schemaName: schemaName,
              foreignKeys: inputs.meta.postCreateForeignKeys,
              runNativeQuery: Helpers.query.runNativeQuery
            }, function(err) {
              Helpers.connection.releaseConnection(connection, leased, function releaseConnectionCb() {
                if (err) {
                  return exits.error(err);
                }
                return exits.success();
              });
              return;
            });
          }); // </ buildIndexes() >
        }); // </ runNativeQuery >
      }); // </ afterNamespaceCreation >
    }); // </ spawnConnection >
  }
});
