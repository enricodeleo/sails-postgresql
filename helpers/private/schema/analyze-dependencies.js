//  ██████╗ ███████╗██████╗ ███████╗███╗   ██╗██████╗ ███████╗███╗   ██╗ ██████╗██╗   ██╗
//  ██╔══██╗██╔════╝██╔══██╗██╔════╝████╗  ██║██╔══██╗██╔════╝████╗  ██║██╔════╝╚██╗ ██╔╝
//  ██║  ██║█████╗  ██████╔╝█████╗  ██╔██╗ ██║██║  ██║█████╗  ██╔██╗ ██║██║      ╚████╔╝
//  ██║  ██║██╔══╝  ██╔═══╝ ██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██║╚██╗██║██║       ╚██╔╝
//  ██████╔╝███████╗██║     ███████╗██║ ╚████║██████╔╝███████╗██║ ╚████║╚██████╗   ██║
//  ╚═════╝ ╚══════╝╚═╝     ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝   ╚═╝
//
// Analyze model definitions to detect foreign key dependencies and create a dependency graph

var _ = require('@sailshq/lodash');

/**
 * Analyzes model definitions to detect foreign key dependencies
 * and returns a sorted list of tables in the order they should be created.
 * 
 * @param {Object} models - Object containing all model definitions
 * @returns {Object} Object with sorted table names and dependency info
 */
module.exports = function analyzeDependencies(models) {
  console.log('FOREIGN KEYS: Analyzing dependencies for models:', Object.keys(models));
  // Initialize dependency tracking
  var dependencies = {};
  var foreignKeys = {};
  var tableNames = [];

  // First pass: collect all table names and identify foreign key relationships
  _.each(models, function(modelDef, modelName) {
    var tableName = modelDef.tableName || modelName;
    
    // Add to our list of tables
    if (!_.contains(tableNames, tableName)) {
      tableNames.push(tableName);
    }
    
    // Initialize dependencies for this table
    if (!dependencies[tableName]) {
      dependencies[tableName] = [];
    }
    
    // Initialize foreign keys collection for this table
    if (!foreignKeys[tableName]) {
      foreignKeys[tableName] = [];
    }
    
    // Analyze attributes for foreign key relationships
    _.each(modelDef.definition, function(attribute, attrName) {
      console.log('FOREIGN KEYS: Analyzing attribute:', attrName, 'in model:', modelName);
      console.log('FOREIGN KEYS: Attribute:', JSON.stringify(attribute, null, 2));
      
      // Skip attributes that aren't associations or don't have foreignKey: true
      if (!attribute.model || !attribute.meta || attribute.meta.foreignKey !== true) {
        console.log('FOREIGN KEYS: Skipping attribute:', attrName, 'in model:', modelName, '- not a foreign key');
        return;
      }
      
      console.log('FOREIGN KEYS: Found foreign key in model:', modelName, 'attribute:', attrName, 'references model:', attribute.model);
      console.log('FOREIGN KEYS: Attribute details:', JSON.stringify(attribute, null, 2));
      
      // Get the referenced model and table
      var referencedModel = models[attribute.model];
      if (!referencedModel) {
        return;
      }
      
      var referencedTable = referencedModel.tableName || attribute.model;
      
      // Skip self-referencing tables (these will be handled after table creation)
      if (tableName === referencedTable) {
        return;
      }
      
      // Add dependency
      if (!_.contains(dependencies[tableName], referencedTable)) {
        dependencies[tableName].push(referencedTable);
      }
      
      // Store foreign key info
      foreignKeys[tableName].push({
        columnName: attribute.columnName || attrName,
        references: referencedTable,
        referencedColumnName: referencedModel.primaryKey || 'id',
        onUpdate: (attribute.meta && attribute.meta.onUpdate) || 'NO ACTION',
        onDelete: (attribute.meta && attribute.meta.onDelete) || 'NO ACTION'
      });
    });
  });
  
  // Topological sort to determine creation order
  var sorted = [];
  var visited = {};
  var temp = {};
  
  function visit(tableName) {
    // If we've visited this node already, skip it
    if (visited[tableName]) {
      return;
    }
    
    // If we detect a cycle, skip this node
    if (temp[tableName]) {
      return;
    }
    
    // Mark this node as being visited
    temp[tableName] = true;
    
    // Visit all dependencies
    var deps = dependencies[tableName] || [];
    for (var i = 0; i < deps.length; i++) {
      visit(deps[i]);
    }
    
    // Mark as visited and add to sorted list
    temp[tableName] = false;
    visited[tableName] = true;
    sorted.push(tableName);
  }
  
  // Visit all nodes
  for (var i = 0; i < tableNames.length; i++) {
    visit(tableNames[i]);
  }
  
  var result = {
    sortedTables: sorted,
    dependencies: dependencies,
    foreignKeys: foreignKeys
  };
  
  console.log('FOREIGN KEYS: Dependency analysis complete');
  console.log('FOREIGN KEYS: Sorted tables:', result.sortedTables);
  console.log('FOREIGN KEYS: Dependencies:', JSON.stringify(result.dependencies, null, 2));
  console.log('FOREIGN KEYS: Foreign keys:', JSON.stringify(result.foreignKeys, null, 2));
  
  return result;
};
