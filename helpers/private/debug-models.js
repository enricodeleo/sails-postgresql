//  ██████╗ ███████╗██████╗ ██╗   ██╗ ██████╗     ███╗   ███╗ ██████╗ ██████╗ ███████╗██╗     ███████╗
//  ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝     ████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║     ██╔════╝
//  ██║  ██║█████╗  ██████╔╝██║   ██║██║  ███╗    ██╔████╔██║██║   ██║██║  ██║█████╗  ██║     ███████╗
//  ██║  ██║██╔══╝  ██╔══██╗██║   ██║██║   ██║    ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝  ██║     ╚════██║
//  ██████╔╝███████╗██████╔╝╚██████╔╝╚██████╔╝    ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗███████╗███████║
//  ╚═════╝ ╚══════╝╚═════╝  ╚═════╝  ╚═════╝     ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚══════╝
//
// Helper for debugging model structures

var _ = require('@sailshq/lodash');

/**
 * Debug model structures to help diagnose foreign key issues
 * 
 * @param {Object} models - Object containing all model definitions
 */
module.exports = function debugModels(models) {
  console.log('=== DEBUG MODELS START ===');
  
  _.each(models, function(model, modelName) {
    console.log('\nModel:', modelName);
    console.log('  tableName:', model.tableName || modelName);
    console.log('  primaryKey:', model.primaryKey || 'id');
    console.log('  Schema keys:', Object.keys(model.schema || {}));
    
    console.log('  Attributes with foreign keys:');
    var hasForeignKeys = false;
    
    _.each(model.schema, function(attribute, attrName) {
      console.log('    Attribute:', attrName);
      console.log('      type:', attribute.type);
      console.log('      model:', attribute.model);
      console.log('      meta:', JSON.stringify(attribute.meta || {}));
      
      if (attribute.model && attribute.meta && attribute.meta.foreignKey === true) {
        hasForeignKeys = true;
        console.log('    - FOREIGN KEY:', attrName, '→', attribute.model);
        console.log('      columnName:', attribute.columnName || attrName);
        console.log('      onDelete:', (attribute.meta && attribute.meta.onDelete) || 'NO ACTION');
        console.log('      onUpdate:', (attribute.meta && attribute.meta.onUpdate) || 'NO ACTION');
      }
    });
    
    if (!hasForeignKeys) {
      console.log('    None');
    }
  });
  
  console.log('\n=== DEBUG MODELS END ===');
};
