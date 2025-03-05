//  ███████╗ ██████╗ ██████╗ ███████╗██╗ ██████╗ ███╗   ██╗    ██╗  ██╗███████╗██╗   ██╗███████╗
//  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██║██╔════╝ ████╗  ██║    ██║ ██╔╝██╔════╝╚██╗ ██╔╝██╔════╝
//  █████╗  ██║   ██║██████╔╝█████╗  ██║██║  ███╗██╔██╗ ██║    █████╔╝ █████╗   ╚████╔╝ ███████╗
//  ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ██║██║   ██║██║╚██╗██║    ██╔═██╗ ██╔══╝    ╚██╔╝  ╚════██║
//  ██║     ╚██████╔╝██║  ██║███████╗██║╚██████╔╝██║ ╚████║    ██║  ██╗███████╗   ██║   ███████║
//  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝    ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝
//
// Add foreign key constraints to existing tables

var _ = require('@sailshq/lodash');
var async = require('async');

/**
 * Adds foreign key constraints to tables after they've been created.
 * This is particularly useful for self-referencing tables and circular dependencies.
 * 
 * @param {Object} options - Options object containing connection, tableName, schemaName, and foreignKeys
 * @param {Function} cb - Callback function
 */
module.exports = function addForeignKeys(options, cb) {
  //  ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╔═╗  ┌─┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
  //  ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║╣   │ │├─┘ │ ││ ││││└─┐
  //   ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╚═╝  └─┘┴   ┴ ┴└─┘┘└┘└─┘
  if (_.isUndefined(options) || !_.isPlainObject(options)) {
    throw new Error('Invalid options argument. Options must contain: connection, tableName, schemaName, and foreignKeys.');
  }

  if (!_.has(options, 'connection') || !_.isObject(options.connection)) {
    throw new Error('Invalid option used in options argument. Missing or invalid connection.');
  }

  if (!_.has(options, 'tableName') || !_.isString(options.tableName)) {
    throw new Error('Invalid option used in options argument. Missing or invalid tableName.');
  }

  if (!_.has(options, 'schemaName') || !_.isString(options.schemaName)) {
    throw new Error('Invalid option used in options argument. Missing or invalid schemaName.');
  }

  if (!_.has(options, 'foreignKeys') || !_.isArray(options.foreignKeys)) {
    throw new Error('Invalid option used in options argument. Missing or invalid foreignKeys.');
  }

  var connection = options.connection;
  var tableName = options.tableName;
  var schemaName = options.schemaName;
  var foreignKeys = options.foreignKeys;
  var runNativeQuery = options.runNativeQuery;

  // If there are no foreign keys to add, just return
  if (foreignKeys.length === 0) {
    console.log('FOREIGN KEYS: No foreign keys to add for table:', tableName);
    return setImmediate(function() {
      cb();
    });
  }
  
  console.log('FOREIGN KEYS: Adding', foreignKeys.length, 'foreign key constraints to table:', tableName);

  // Process each foreign key constraint
  async.eachSeries(foreignKeys, function(foreignKey, next) {
    // Build the ALTER TABLE statement
    var fullTableName = '"' + schemaName + '"."' + tableName + '"';
    var constraintName = '"fk_' + tableName + '_' + foreignKey.columnName + '"';
    
    var query = 'ALTER TABLE ' + fullTableName + ' ADD CONSTRAINT ' + constraintName + 
                ' FOREIGN KEY ("' + foreignKey.columnName + '") REFERENCES "' + 
                schemaName + '"."' + foreignKey.references + '" ("' + foreignKey.referencedColumnName + '")';
    
    console.log('FOREIGN KEYS: Executing query:', query);
    
    // Add ON DELETE clause if specified
    if (foreignKey.onDelete && foreignKey.onDelete !== 'NO ACTION') {
      query += ' ON DELETE ' + foreignKey.onDelete;
    }
    
    // Add ON UPDATE clause if specified
    if (foreignKey.onUpdate && foreignKey.onUpdate !== 'NO ACTION') {
      query += ' ON UPDATE ' + foreignKey.onUpdate;
    }
    
    // Run the query
    runNativeQuery(connection, query, [], function(err) {
      if (err) {
        // If the error is about the constraint already existing, just continue
        if (err.code === '42P07' || (err.message && err.message.indexOf('already exists') > -1)) {
          console.log('FOREIGN KEYS: Constraint already exists, continuing');
          return next();
        }
        console.error('FOREIGN KEYS: Error adding constraint:', err);
        return next(err);
      }
      console.log('FOREIGN KEYS: Successfully added constraint for column:', foreignKey.columnName);
      return next();
    });
  }, cb);
};
