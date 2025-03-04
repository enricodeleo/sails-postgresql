var _ = require('@sailshq/lodash');

// Global registry to track table dependencies
// This will be used to determine the order of table creation
if (!global._tableRegistry) {
  global._tableRegistry = {
    tables: {},
    dependencies: {},
    tableExists: function(tableName) {
      return !!this.tables[tableName];
    },
    registerTable: function(tableName) {
      this.tables[tableName] = true;
    },
    addDependency: function(tableName, dependsOn) {
      if (!this.dependencies[tableName]) {
        this.dependencies[tableName] = [];
      }
      if (!this.dependencies[tableName].includes(dependsOn)) {
        this.dependencies[tableName].push(dependsOn);
      }
    },
    getDependencies: function(tableName) {
      return this.dependencies[tableName] || [];
    },
    reset: function() {
      this.tables = {};
      this.dependencies = {};
    }
  };
}

module.exports = function processForeignKeys(definition, tableName) {
  console.log('PROCESSING FOREIGN KEYS');

  // Track foreign key dependencies
  var hasForeignKeys = false;
  var deferredForeignKeys = [];

  // Process columns with meta.foreignKey, model property, or column name matching a model name
  _.forEach(definition, (attribute, columnName) => {
    // Case 1: Explicit foreignKey in meta
    if (attribute.meta && attribute.meta.foreignKey === true) {
      var referencedTable = attribute.meta.references || attribute.model || columnName;
      var referencedColumn = attribute.meta.referencesKey || 'id';

      attribute._isForeignKey = true;
      attribute._referencesTable = referencedTable;
      attribute._referencesColumn = referencedColumn;
      
      // Add ON DELETE/UPDATE behavior if specified
      if (attribute.meta.onDelete) {
        attribute._onDelete = attribute.meta.onDelete.toUpperCase();
      }
      
      if (attribute.meta.onUpdate) {
        attribute._onUpdate = attribute.meta.onUpdate.toUpperCase();
      }

      // Track dependency
      if (tableName && referencedTable !== tableName) {
        global._tableRegistry.addDependency(tableName, referencedTable);
        hasForeignKeys = true;
        
        // Build the constraint
        var constraintName = `fk_${tableName}_${columnName}_${referencedTable}`;
        var onDelete = attribute._onDelete ? ` ON DELETE ${attribute._onDelete}` : ' ON DELETE RESTRICT';
        var onUpdate = attribute._onUpdate ? ` ON UPDATE ${attribute._onUpdate}` : ' ON UPDATE CASCADE';
        
        // Check if the referenced table exists already
        if (global._tableRegistry.tableExists(referencedTable)) {
          // We can add the constraint directly in the column definition
          attribute._foreignKeyConstraint = `REFERENCES "${referencedTable}" ("${referencedColumn}")${onDelete}${onUpdate}`;
          console.log(`Foreign key constraint will be added inline for ${columnName} -> ${referencedTable}.${referencedColumn}`);
        } else {
          // We need to defer this constraint until after all tables are created
          console.log(`Deferring foreign key constraint for ${columnName} -> ${referencedTable}.${referencedColumn} (table doesn't exist yet)`);
          deferredForeignKeys.push({
            columnName: columnName,
            referencedTable: referencedTable,
            referencedColumn: referencedColumn,
            constraintName: constraintName,
            constraint: `CONSTRAINT "${constraintName}" FOREIGN KEY ("${columnName}") REFERENCES "${referencedTable}" ("${referencedColumn}")${onDelete}${onUpdate}`
          });
        }
      }

      console.log(`Added foreign key metadata to ${columnName} from meta`);
    }
    // Case 2: Implicit foreignKey from model property
    else if (attribute.model) {
      attribute._isForeignKey = true;
      attribute._referencesTable = attribute.model;
      attribute._referencesColumn = 'id'; // Default to id
      
      // Track dependency
      if (tableName && attribute.model !== tableName) {
        global._tableRegistry.addDependency(tableName, attribute.model);
        hasForeignKeys = true;
        
        // Build the constraint
        var constraintName = `fk_${tableName}_${columnName}_${attribute.model}`;
        var onDelete = ' ON DELETE RESTRICT'; // Default behavior
        var onUpdate = ' ON UPDATE CASCADE'; // Default behavior
        
        // Check if the referenced table exists already
        if (global._tableRegistry.tableExists(attribute.model)) {
          // We can add the constraint directly in the column definition
          attribute._foreignKeyConstraint = `REFERENCES "${attribute.model}" ("id")${onDelete}${onUpdate}`;
          console.log(`Foreign key constraint will be added inline for ${columnName} -> ${attribute.model}.id`);
        } else {
          // We need to defer this constraint until after all tables are created
          console.log(`Deferring foreign key constraint for ${columnName} -> ${attribute.model}.id (table doesn't exist yet)`);
          deferredForeignKeys.push({
            columnName: columnName,
            referencedTable: attribute.model,
            referencedColumn: 'id',
            constraintName: constraintName,
            constraint: `CONSTRAINT "${constraintName}" FOREIGN KEY ("${columnName}") REFERENCES "${attribute.model}" ("id")${onDelete}${onUpdate}`
          });
        }
      }
      
      console.log(`Added foreign key metadata to ${columnName} from model property`);
    }
    // Case 3: Detect foreign keys by naming convention (columnName ending with 'Id' or matching a model name)
    else if (
      // Check if the column name ends with "Id" (case insensitive)
      (columnName.toLowerCase().endsWith('id') && columnName.toLowerCase() !== 'id') || 
      // Or if the column name itself might be a reference to another model
      (columnName.match(/^[a-z]+$/) && columnName !== 'id' && columnName !== 'createdAt' && columnName !== 'updatedAt')
    ) {
      // Try to determine the referenced table name
      var possibleModelName;
      
      if (columnName.toLowerCase().endsWith('id')) {
        // If column is "userId", the model would be "user"
        possibleModelName = columnName.slice(0, -2).toLowerCase();
      } else {
        // If column is "user", the model would be "user"
        possibleModelName = columnName.toLowerCase();
      }
      
      // Check if this table exists in our registry
      if (global._tableRegistry.tableExists(possibleModelName)) {
        console.log(`Detected potential foreign key by naming convention: ${columnName} -> ${possibleModelName}`);
        
        attribute._isForeignKey = true;
        attribute._referencesTable = possibleModelName;
        attribute._referencesColumn = 'id';
        
        // Track dependency
        global._tableRegistry.addDependency(tableName, possibleModelName);
        hasForeignKeys = true;
        
        // Build the constraint
        var constraintName = `fk_${tableName}_${columnName}_${possibleModelName}`;
        var onDelete = ' ON DELETE RESTRICT'; // Default behavior
        var onUpdate = ' ON UPDATE CASCADE'; // Default behavior
        
        // Add the constraint directly in the column definition
        attribute._foreignKeyConstraint = `REFERENCES "${possibleModelName}" ("id")${onDelete}${onUpdate}`;
        console.log(`Foreign key constraint will be added for ${columnName} -> ${possibleModelName}.id (detected by naming convention)`);
      }
    }
  });

  // Store deferred foreign keys for later processing
  if (deferredForeignKeys.length > 0) {
    definition._deferredForeignKeys = deferredForeignKeys;
  }

  // Mark if this definition has foreign keys
  if (hasForeignKeys) {
    definition._hasForeignKeys = true;
  }

  return definition;
};
