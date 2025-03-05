var _ = require('@sailshq/lodash');

module.exports = function processForeignKeys(
  definition,
  tableName,
  connection,
  cb
) {
  console.log('PROCESSING FOREIGN KEYS FOR:', tableName);

  // Track foreign key dependencies
  var hasForeignKeys = false;
  var deferredForeignKeys = [];

  // Query existing tables in the database
  var tablesQuery = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  `;

  connection.query(tablesQuery, (err, result) => {
    if (err) {
      console.error('Error querying existing tables:', err);
      return cb(err);
    }

    // Extract table names from the query result
    var existingTables = result.rows.map((row) => {
      return row.table_name;
    });

    console.log('EXISTING TABLES:', existingTables);

    // Process columns with meta.foreignKey, model property, or column name matching a model name
    _.forEach(definition, (attribute, columnName) => {
      // Case 1: Explicit foreignKey in meta
      if (attribute.meta && attribute.meta.foreignKey === true) {
        var referencedTable =
          attribute.meta.references || attribute.model || columnName;
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
          hasForeignKeys = true;

          // Build the constraint
          var constraintName = `fk_${tableName}_${columnName}_${referencedTable}`;
          var onDelete = attribute._onDelete
            ? ` ON DELETE ${attribute._onDelete}`
            : ' ON DELETE RESTRICT';
          var onUpdate = attribute._onUpdate
            ? ` ON UPDATE ${attribute._onUpdate}`
            : ' ON UPDATE CASCADE';

          // Check if the referenced table exists in the database
          if (existingTables.includes(referencedTable)) {
            // We can add the constraint directly in the column definition
            attribute._foreignKeyConstraint = `REFERENCES '${referencedTable}' ('${referencedColumn}')${onDelete}${onUpdate}`;
            console.log(
              `Foreign key constraint will be added inline for ${columnName} -> ${referencedTable}.${referencedColumn}`
            );
          } else {
            // We need to defer this constraint until after all tables are created
            console.log(
              `Deferring foreign key constraint for ${columnName} -> ${referencedTable}.${referencedColumn} (table doesn't exist yet)`
            );
            deferredForeignKeys.push({
              columnName: columnName,
              referencedTable: referencedTable,
              referencedColumn: referencedColumn,
              constraintName: constraintName,
              constraint: `CONSTRAINT '${constraintName}' FOREIGN KEY ('${columnName}') REFERENCES '${referencedTable}' ('${referencedColumn}')${onDelete}${onUpdate}`,
            });
          }
        }

        console.log(`Added foreign key metadata to ${columnName} from meta`);
      }
      // [Rest of the code for other cases remains the same but uses existingTables]
      // ...
    });

    // Store deferred foreign keys for later processing
    if (deferredForeignKeys.length > 0) {
      definition._deferredForeignKeys = deferredForeignKeys;
    }

    // Mark if this definition has foreign keys
    if (hasForeignKeys) {
      definition._hasForeignKeys = true;
    }

    return cb(null, definition);
  });
};
