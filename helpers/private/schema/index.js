module.exports = {
  buildSchema: require('./build-schema'),
  buildIndexes: require('./build-indexes'),
  escapeTableName: require('./escape-table-name'),
  createNamespace: require('./create-namespace'),
  analyzeDependencies: require('./analyze-dependencies'),
  addForeignKeys: require('./add-foreign-keys')
};
