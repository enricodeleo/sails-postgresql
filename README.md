# Sails PostgreSQL

A [Waterline](http://waterlinejs.org) adapter for working with the PostgreSQL database.

## Features

### Native Foreign Keys

This adapter supports native PostgreSQL foreign key constraints. You can define foreign key relationships in your models using the following approaches:

#### 1. Using the `model` property (implicit)

```javascript
attributes: {
  company: {
    model: 'company'  // Will create a foreign key to the company table's id column
  }
}
```

#### 2. Using the `meta.foreignKey` property (explicit)

```javascript
attributes: {
  companyId: {
    type: 'number',
    meta: {
      foreignKey: true,
      references: 'company',     // Table name to reference
      referencesKey: 'id',       // Column name to reference (default: 'id')
      onDelete: 'cascade',       // ON DELETE behavior (options: CASCADE, SET NULL, RESTRICT, NO ACTION)
      onUpdate: 'cascade'        // ON UPDATE behavior (options: CASCADE, SET NULL, RESTRICT, NO ACTION)
    }
  }
}
```

The adapter handles table creation order automatically, ensuring that foreign key constraints are created properly even when tables are created in an order that would normally cause reference errors.

### Relationship Types

This adapter supports the following relationship types using native PostgreSQL foreign keys:

#### One-to-One Relationships

A one-to-one relationship is where one record in a table is associated with exactly one record in another table.

```javascript
// User.js
module.exports = {
  attributes: {
    name: { type: 'string' },
    // One-to-one: A user has one profile
    profile: {
      model: 'profile'
    }
  }
};

// Profile.js
module.exports = {
  attributes: {
    bio: { type: 'string' },
    // One-to-one: A profile belongs to one user
    owner: {
      model: 'user',
      unique: true  // Ensures one-to-one relationship
    }
  }
};
```

#### One-to-Many Relationships

A one-to-many relationship is where one record in a table can be associated with multiple records in another table.

```javascript
// Company.js
module.exports = {
  attributes: {
    name: { type: 'string' },
    // One-to-many: A company has many addresses
    // This is the "one" side, defined using collection
    addresses: {
      collection: 'address',
      via: 'company'
    }
  }
};

// Address.js
module.exports = {
  attributes: {
    street: { type: 'string' },
    // One-to-many: An address belongs to one company
    // This is the "many" side, defined using model
    company: {
      model: 'company'  // Creates a foreign key constraint
    }
  }
};
```

#### Many-to-Many Relationships

A many-to-many relationship is where multiple records in a table can be associated with multiple records in another table. This requires a join table with foreign keys to both related tables.

```javascript
// User.js
module.exports = {
  attributes: {
    name: { type: 'string' },
    // Many-to-many: Users can belong to many roles
    roles: {
      collection: 'role',
      via: 'users',
      through: 'userrole'
    }
  }
};

// Role.js
module.exports = {
  attributes: {
    name: { type: 'string' },
    // Many-to-many: Roles can have many users
    users: {
      collection: 'user',
      via: 'roles',
      through: 'userrole'
    }
  }
};

// UserRole.js (Join table)
module.exports = {
  attributes: {
    // Foreign key to User
    user: {
      model: 'user',
      meta: {
        foreignKey: true,
        onDelete: 'cascade'
      }
    },
    // Foreign key to Role
    role: {
      model: 'role',
      meta: {
        foreignKey: true,
        onDelete: 'cascade'
      }
    }
  }
};
```

The join table (`UserRole` in this example) will have proper foreign key constraints to both related tables, ensuring referential integrity at the database level.

## Help

If you have further questions or are having trouble, click [here](http://sailsjs.com/support).


## Bugs &nbsp; [![NPM version](https://badge.fury.io/js/sails-postgresql.svg)](http://npmjs.com/package/sails-postgresql)

To report a bug, [click here](http://sailsjs.com/bugs).


## Contributing

Please observe the guidelines and conventions laid out in the [Sails project contribution guide](http://sailsjs.com/documentation/contributing) when opening issues or submitting pull requests.

[![NPM](https://nodei.co/npm/sails-postgresql.png?downloads=true)](http://npmjs.com/package/sails-postgresql)


## License

The [Sails framework](http://sailsjs.com) is free and open-source under the [MIT License](http://sailsjs.com/license).

