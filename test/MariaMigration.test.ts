import { expect } from 'chai'
import 'mocha'
import { Pool, PoolConfig } from 'mariadb'
import * as mariadb from 'mariadb'
import MariaMigration from '../src/MariaMigration'

let pool: Pool = mariadb.createPool(<PoolConfig>{
  host: 'db',
  database: 'migration_test',
  user: 'migration_test',
  password: 'migration_test'
})
let database = 'migration_test'

after(async function () {
  await pool.end()
})

describe('MariaMigration', function () {
  beforeEach(async function () {
    await pool.query('DROP TABLE IF EXISTS version CASCADE')
    await pool.query('DROP TABLE IF EXISTS a CASCADE')
    await pool.query('DROP TABLE IF EXISTS b CASCADE')
  })

  describe('getTables', function () {
    it('should return all table names', async function () {
      await pool.query('CREATE TABLE a ( id SERIAL PRIMARY KEY )')
      await pool.query('CREATE TABLE b ( id SERIAL PRIMARY KEY, a_id BIGINT UNSIGNED NOT NULL, CONSTRAINT fk_b FOREIGN KEY (a_id) REFERENCES a (id) ON DELETE CASCADE ON UPDATE RESTRICT )')

      let migration = new TestMigration(pool, database, 'version')
      let tables = await migration.getTables()
      expect(tables.length).to.equal(2)
      expect(tables.indexOf('a')).to.not.equal(-1)
      expect(tables.indexOf('b')).to.not.equal(-1)
      await pool.query('ALTER TABLE b DROP FOREIGN KEY fk_b')
    })
  })

  describe('getColumns', function () {
    it('should return all column names', async function () {
      await pool.query('CREATE TABLE a ( c1 VARCHAR(10), c2 INTEGER, c3 TIMESTAMP )')

      let migration = new TestMigration(pool, database, 'version')
      let columns = await migration.getColumns('a')
      expect(columns.length).to.equal(3)
      expect(columns.indexOf('c1')).to.not.equal(-1)
      expect(columns.indexOf('c2')).to.not.equal(-1)
      expect(columns.indexOf('c3')).to.not.equal(-1)
    })
  })

  describe('clearDatabase', function () {
    it('should clear existing tables', async function () {
      await pool.query('CREATE TABLE IF NOT EXISTS a ( id SERIAL PRIMARY KEY )')
      await pool.query('CREATE TABLE IF NOT EXISTS b ( id SERIAL PRIMARY KEY,  a_id BIGINT UNSIGNED NOT NULL, CONSTRAINT fk_b FOREIGN KEY (a_id) REFERENCES a (id))')
      await pool.query('INSERT INTO a (id) VALUES (DEFAULT)')
      await pool.query('INSERT INTO b (id, a_id) VALUES (DEFAULT, 1);')

      let migration = new TestMigration(pool, database, 'version')

      await migration.clearDatabase()

      let tables = await migration.getTables()
      expect(tables.length).to.equal(0)
    })
  })

  describe('versionTableExists', function () {
    it('should return false if the version table does not exist', async function () {
      let migration = new TestMigration(pool, database, 'version')
      await migration.versionTableExists()
    })

    it('should return true if the version table does not exist', async function () {
      await pool.query(`CREATE TABLE version ( version integer )`)
      let migration = new TestMigration(pool, database, 'version')
      await migration.versionTableExists()
      await pool.query(`DROP TABLE version`)
    })
  })

  describe('createVersionTable', function () {
    it('should create the version table if it is not there and insert version 0', async function () {
      await pool.query('DROP TABLE IF EXISTS version')

      let migration = new TestMigration(pool, database, 'version')
      await migration.createVersionTable()

      let tables = await migration.getTables()
      expect(tables.indexOf('version')).to.not.equal(-1)

      let versionResult = await pool.query('SELECT * FROM version')
      expect(versionResult.length).to.equal(1)
      expect(versionResult[0].version).to.equal(0)
    })

    it('should insert version 0 if the table is already there but no version is present', async function () {
      let migration = new TestMigration(pool, database, 'version')
      await migration.createVersionTable()

      await pool.query('DELETE FROM version')

      let selectResultBefore = await pool.query('SELECT * FROM version')
      expect(selectResultBefore.length).to.equal(0)

      await migration.createVersionTable()

      let selectResultAfter = await pool.query('SELECT * FROM version')
      expect(selectResultAfter.length).to.equal(1)
      expect(selectResultAfter[0].version).to.equal(0)
    })
  })

  describe('getVersion', function () {
    it('should create the version table and return the version', async function () {
      let migration = new TestMigration(pool, database, 'version')

      let version = await migration.getVersion()
      let versionTableExists = await migration.versionTableExists()

      expect(versionTableExists).to.be.true
      expect(version).to.equal(0)
    })
  })

  describe('setVersion', function () {
    it('should create the version table and set the version', async function () {
      let migration = new TestMigration(pool, database, 'version')

      await migration.setVersion(5)
      let versionTableExists = await migration.versionTableExists()
      let version = await migration.getVersion()

      expect(versionTableExists).to.be.true
      expect(version).to.equal(5)
    })
  })

  describe('increaseVersion', function () {
    it('should create the version table and increase the version', async function () {
      let migration = new TestMigration(pool, database, 'version')

      let returnedVersion = await migration.increaseVersion()
      let versionTableExists = await migration.versionTableExists()
      let version = await migration.getVersion()

      expect(versionTableExists).to.be.true
      expect(version).to.equal(1)
      expect(returnedVersion).to.equal(1)
    })
  })

  describe('dropTable', function () {
    it('should drop new table', async function () {
      let migration = new TestMigration(pool, database, 'version')
      await pool.query('CREATE TABLE a ( c1 INTEGER )')

      await migration.dropTable('a')
      let tables = await migration.getTables()
      expect(tables.indexOf('a')).to.equal(-1)
    })
  })

  describe('renameTable', function () {
    it('should rename a table', async function () {
      let migration = new TestMigration(pool, database, 'version')
      await pool.query('CREATE TABLE a ( c1 INTEGER, c2 VARCHAR(10) )')

      await migration.renameTable('a', 'b')
      let tables = await migration.getTables()
      expect(tables.indexOf('a')).to.equal(-1)
      expect(tables.indexOf('b')).to.not.equal(-1)
    })
  })

  describe('addColumn', function () {
    it('should add a new column', async function () {
      let migration = new TestMigration(pool, database, 'version')

      await pool.query('CREATE TABLE a ( c1 INTEGER )')

      await migration.addColumn('a', 'c2 VARCHAR(10)')
      let columns = await migration.getColumns('a')
      expect(columns.indexOf('c2')).to.not.equal(-1)
    })
  })

  describe('dropColumn', function () {
    it('should drop a column', async function () {
      let migration = new TestMigration(pool, database, 'version')

      await pool.query('CREATE TABLE a ( c1 INTEGER, c2 VARCHAR(10) )')

      await migration.dropColumn('a', 'c2')
      let columns = await migration.getColumns('a')
      expect(columns.indexOf('c2')).to.equal(-1)
    })
  })

  describe('changeColumn', function () {
    it('should change the type of a column', async function () {
      let migration = new TestMigration(pool, database, 'version')

      await pool.query('CREATE TABLE a ( c1 INTEGER )')

      await migration.changeColumnType('a', 'c1', 'VARCHAR(10)')
      let result = await pool.query(`SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.columns WHERE table_name = 'a' AND column_name = 'c1'`)
      expect(result[0].DATA_TYPE).to.equal('varchar')
      expect(result[0].CHARACTER_MAXIMUM_LENGTH).to.equal(10)
    })
  })
})

class TestMigration extends MariaMigration {
  async migrate(): Promise<void> {

  }
}