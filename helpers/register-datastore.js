//  ██████╗ ███████╗ ██████╗ ██╗███████╗████████╗███████╗██████╗
//  ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝╚══██╔══╝██╔════╝██╔══██╗
//  ██████╔╝█████╗  ██║  ███╗██║███████╗   ██║   █████╗  ██████╔╝
//  ██╔══██╗██╔══╝  ██║   ██║██║╚════██║   ██║   ██╔══╝  ██╔══██╗
//  ██║  ██║███████╗╚██████╔╝██║███████║   ██║   ███████╗██║  ██║
//  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
//
//  ██████╗  █████╗ ████████╗ █████╗ ███████╗████████╗ ██████╗ ██████╗ ███████╗
//  ██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██╔════╝
//  ██║  ██║███████║   ██║   ███████║███████╗   ██║   ██║   ██║██████╔╝█████╗
//  ██║  ██║██╔══██║   ██║   ██╔══██║╚════██║   ██║   ██║   ██║██╔══██╗██╔══╝
//  ██████╔╝██║  ██║   ██║   ██║  ██║███████║   ██║   ╚██████╔╝██║  ██║███████╗
//  ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝
//

module.exports = require('machine').build({


  friendlyName: 'Register Datastore',


  description: 'Register a new datastore with the PostgreSQL adapter.',


  inputs: {

    identity: {
      description: 'The unique identity of the datastore.',
      required: true,
      example: 'my-postgres-db'
    },

    config: {
      description: 'The PostgreSQL Adapter configuration to use for the datastore.',
      required: true,
      example: '==='
    },

    models: {
      description: 'The Waterline models that will be used with this datastore.',
      required: true,
      example: '==='
    },

    datastores: {
      description: 'An object containing all of the datastores that have been registered.',
      required: true,
      example: '==='
    },

    modelDefinitions: {
      description: 'An object containing all of the model definitions that have been registered.',
      required: true,
      example: '==='
    }

  },


  exits: {

    success: {
      description: 'The datastore was registered successfully.'
    },

    badConfiguration: {
      description: 'The configuration was invalid.',
      outputType: 'ref'
    }

  },


  fn: function registerDatastore(inputs, exits) {
    // Dependencies
    var _ = require('@sailshq/lodash');
    var PG = require('machinepack-postgresql');
    var Helpers = require('./private');

    // Validate that the connection has the minimum configuration needed
    if (!inputs.config.host) {
      return exits.badConfiguration(new Error('The host connection string is required to use the PostgreSQL adapter.'));
    }

    if (!inputs.config.database) {
      return exits.badConfiguration(new Error('The database connection string is required to use the PostgreSQL adapter.'));
    }

    // Loop through every model assigned to the datastore and validate the primary
    // key. If a custom columnName is used that doesn't match the casing in the
    // definition it could cause problems later.
    _.each(inputs.models, function validatePrimaryKey(modelDef) {
      var primaryKeyAttr = modelDef.definition[modelDef.primaryKey];

      // Make sure the primary key field doesn't have a custom column name set.
      if (primaryKeyAttr.columnName) {
        return exits.badConfiguration(new Error('The custom columnName on the primary key may not be supported.'));
      }
    });

    // Build up the connection string used by machinepack-postgresql
    var connectionString = 'postgres://';

    // If a url was provided, use it for the connection string and then go
    // ahead and bail out. This is used mostly for PaaS providers like Heroku.
    if (inputs.config.url) {
      connectionString = inputs.config.url;
    } else {
      // Otherwise build up a connection string from the individual parts

      // If a user was supplied, append it to the connection string
      if (inputs.config.user) {
        connectionString += inputs.config.user;
      }

      // If a password was supplied, append it to the connection string
      if (inputs.config.password) {
        connectionString += ':' + inputs.config.password;
      }

      // If a host was supplied, append it to the connection string
      if (inputs.config.host) {
        connectionString += '@' + inputs.config.host;
      }

      // If a port was supplied, append it to the connection string
      if (inputs.config.port) {
        connectionString += ':' + inputs.config.port;
      }

      // If a database was supplied, append it to the connection string
      if (inputs.config.database) {
        connectionString += '/' + inputs.config.database;
      }
    }

    // Validate that the connection string is valid
    try {
      new URL(connectionString);
    } catch (e) {
      return exits.badConfiguration(new Error('Invalid connection string. Please check the connection config and try again.'));
    }

    // Create a new manager to use for the datastore
    var report;
    try {
      report = Helpers.connection.createManager(connectionString, inputs.config);
    } catch (e) {
      return exits.badConfiguration(e);
    }

    // Store the connection manager and config in the datastores object
    inputs.datastores[inputs.identity] = {
      manager: report.manager,
      config: inputs.config
    };

    // Store the model definitions
    inputs.modelDefinitions[inputs.identity] = inputs.models;

    // Analyze model dependencies for foreign keys
    console.log('FOREIGN KEYS: Registering datastore with models:', Object.keys(inputs.models));
    
    // Check if any models have foreign key relationships
    var hasForeignKeys = false;
    console.log('FOREIGN KEYS: Checking models in registerDatastore');
    _.each(inputs.models, function(model, modelName) {
      console.log('FOREIGN KEYS: Checking model definition:', modelName, Object.keys(model.definition || {}));
      _.each(model.definition, function(attribute, attrName) {
        console.log('FOREIGN KEYS: Checking attribute:', attrName, 'model:', attribute.model, 'meta:', JSON.stringify(attribute.meta || {}));
        if (attribute.model && attribute.meta && attribute.meta.foreignKey === true) {
          hasForeignKeys = true;
          console.log('FOREIGN KEYS: Found foreign key in model:', modelName, 'attribute:', attrName, 'referencing:', attribute.model);
        }
      });
    });
    
    if (hasForeignKeys) {
      console.log('FOREIGN KEYS: Foreign key relationships detected, analyzing dependencies');
      var dependencyInfo = Helpers.schema.analyzeDependencies(inputs.models);
      
      // Store the dependency info in the datastore for later use
      inputs.datastores[inputs.identity].dependencyInfo = dependencyInfo;
      
      console.log('FOREIGN KEYS: Dependency analysis complete for datastore:', inputs.identity);
    } else {
      console.log('FOREIGN KEYS: No foreign key relationships detected in datastore:', inputs.identity);
    }

    return exits.success();
  }
});
