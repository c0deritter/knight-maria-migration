import { Pool } from 'mariadb'

export default abstract class MariaMigration {

  pool: Pool
  database: string | undefined
  versionTable: string

  constructor(pool: Pool, database: string, versionTable: string = 'version') {
    this.database = database
    this.pool = pool
    this.versionTable = versionTable
  }

  abstract migrate(): Promise<void>

  async versionTableExists(): Promise<boolean> {
    let tables = await this.getTables()
    return tables.indexOf(this.versionTable) > -1
  }

  async createVersionTable(): Promise<void> {
    if (! await this.versionTableExists()) {

      try {
        await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.versionTable} ( version INTEGER )`);
      }
      catch (e) {
        throw new Error(<any>e)
      }

      try {
        await this.pool.query(`INSERT INTO ${this.versionTable} (version) VALUES (0)`)
      }
      catch (e) {
        throw new Error(<any>e)
      }
    }
    else {
      try {
        var selectResult = await this.pool.query(`SELECT * FROM ${this.versionTable}`)
      }
      catch (e) {
        throw new Error(<any>e)
      }

      if (selectResult.length === 0) {
        try {
          await this.pool.query(`INSERT INTO ${this.versionTable} (version) VALUES (0)`)
          await this.pool.query(`SELECT * FROM ${this.versionTable}`)
        }
        catch (e) {
          throw new Error(<any>e)
        }
      }
    }
  }

  async getVersion(): Promise<number> {
    await this.createVersionTable()
    let selectResult: any

    try {
      selectResult = await this.pool.query(`SELECT * FROM ${this.versionTable}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }

    if (selectResult != undefined && selectResult.length == 1) {
      return selectResult[0].version
    }
    else {
      throw new Error('Row count of version table was not exactly 1')
    }
  }

  async setVersion(version: number): Promise<void> {
    await this.createVersionTable()

    try {
      await this.pool.query(`UPDATE ${this.versionTable} SET version = ${version}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }
  }

  async increaseVersion(): Promise<number> {
    await this.createVersionTable()

    try {
      await this.pool.query(`UPDATE ${this.versionTable} SET version = version + 1`)
      var updateResult = await this.pool.query(`SELECT * FROM ${this.versionTable}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }

    return updateResult[0].version
  }

  async getTables(): Promise<string[]> {
    let tableName = 'Tables_in_' + this.database

    try {
      var result = await this.pool.query(`SHOW TABLES`)

    }
    catch (e) {
      throw new Error(<any>e)
    }

    let tables: string[] = []
    if (result) {
      for (let row of result) {
        tables.push(row[tableName])
      }
    }
    return tables
  }

  async getColumns(table: string): Promise<string[]> {
    let result

    try {
      result = await this.pool.query(`SHOW COLUMNS FROM ${table}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }

    let columns: string[] = []
    for (let row of result) {
      columns.push(row.Field)
    }
    return columns
  }

  async clearDatabase(): Promise<string[]> {
    let tables = await this.getTables()

    try {
      //first delete all foreign keys
      let comandsToSelectAllForeignKeys = await this.pool.query(`SELECT concat('ALTER TABLE ', TABLE_NAME, ' DROP FOREIGN KEY ', CONSTRAINT_NAME, ';') FROM information_schema.key_column_usage WHERE CONSTRAINT_SCHEMA = '${this.database}' AND referenced_table_name IS NOT NULL`)
      for (let command of comandsToSelectAllForeignKeys) {
        for (var key in command) {
          await this.pool.query(command[key])
        }
      }
      for (let table of tables) {
        await this.pool.query(`DROP TABLE IF EXISTS ${table};`)
      }
    }
    catch (e) {
      throw new Error(<any>e)
    }

    let remainingTables = await this.getTables()
    while (remainingTables.length > 0) {
      remainingTables = await this.clearDatabase()
    }

    return tables
  }

  async resetDatabase(): Promise<void> {
    await this.clearDatabase()
    await this.migrate()
  }

  async addColumn(table: string, column: string) {
    let result

    try {
      result = await this.pool.query(`ALTER TABLE ${table} ADD COLUMN ${column}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }

    return result
  }

  async dropTable(table: string) {

    try {
      await this.pool.query(`DROP TABLE ${table} CASCADE`)
    }
    catch (e) {
      throw new Error(<any>e)
    }
  }

  async renameTable(oldTableName: string, newTableName: string) {

    try {
      await this.pool.query(`ALTER TABLE ${oldTableName} RENAME TO ${newTableName}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }
  }

  async dropColumn(table: string, column: string) {

    try {
      await this.pool.query(`ALTER TABLE ${table} DROP COLUMN ${column}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }
  }

  async renameColumn(table: string, oldColumnName: string, newColumnName: string) {

    try {
      await this.pool.query(`ALTER TABLE ${table} RENAME COLUMN ${oldColumnName} TO ${newColumnName}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }
  }

  async changeColumnType(table: string, column: string, type: string) {

    try {
      await this.pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${type}`)
    }
    catch (e) {
      throw new Error(<any>e)
    }
  }
}