/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as fs from "fs";
import { ECDb } from "./ECDb";
import { Briefcase, BriefcaseAccessMode } from "@bentley/imodeljs-clients";
import { BentleyPromise } from "@bentley/bentleyjs-core/lib/Bentley";
import { DbResult, OpenMode } from "@bentley/bentleyjs-core/lib/BeSQLite";
import { BindingValue } from "./BindingUtility";

declare const __dirname: string;

/** Local store/cache backing a service */
export class ServiceStore {
  private static instance: ServiceStore;

  /** Hidden constructor (use singleton instance)  */
  private constructor(private db: ECDb) {}

  private static getDbPathname(): string {
    return __dirname + "/../assets/ServiceStore.ecdb";
  }

  private static getSchemaPathname(): string {
    return __dirname + "/../assets/ServiceStore.ecschema.xml";
  }

  private static async openOrCreateDb(): BentleyPromise<DbResult, ECDb> {
    const ecdb = new ECDb();
    const pathname = ServiceStore.getDbPathname();
    let { error } = fs.existsSync(pathname) ? await ecdb.openDb(pathname, OpenMode.ReadWrite) : await ecdb.createDb(pathname);
    if (error)
      return { error };

    ({ error } = await ecdb.importSchema(ServiceStore.getSchemaPathname()));
    if (error)
      return { error };

    return {result: ecdb};
  }

  /** Gets the singleton instance */
  public static async getInstance(): BentleyPromise<DbResult, ServiceStore> {
    if (ServiceStore.instance)
      return {result: ServiceStore.instance};

    const {error, result: db} = await ServiceStore.openOrCreateDb();
    if (error)
      return {error};

    ServiceStore.instance = new ServiceStore(db!);
    return {result: ServiceStore.instance};
  }

  /** Close the store (i.e., the underlying Db) */
  public async close(): BentleyPromise<DbResult, void> {
    if (!this.db.isDbOpen())
      return {};

    return this.db.closeDb();
  }

  /** Get a briefcase given some query paramters */
  public async getBriefcase(iModelId: string, changeSetId?: string|undefined, userId?: string|undefined, accessMode: BriefcaseAccessMode = BriefcaseAccessMode.Shared): BentleyPromise<DbResult, Briefcase|undefined> {
    const {error, result: briefcaseId} = await this.queryBriefcaseId(iModelId, changeSetId, userId, accessMode);
    if (error)
      return {error};

    if (!briefcaseId)
      return {result: undefined};

    return this.getBriefcaseById(briefcaseId);
  }

  /** Determine if the store contains a briefcase with the supplied parameters */
  public async containsBriefcase(iModelId: string, changeSetId?: string|undefined, userId?: string|undefined, accessMode: BriefcaseAccessMode = BriefcaseAccessMode.Shared): BentleyPromise<DbResult, boolean> {
    const {error, result: briefcaseId} = await this.queryBriefcaseId(iModelId, changeSetId, userId, accessMode);
    if (error)
      return {error};
    return {result: !!briefcaseId};
  }

  /** Insert a new briefcase
   * @returns Valid id if successful. Error status otherwise.
   */
  public async insertBriefcase(briefcase: Briefcase): BentleyPromise<DbResult, void> {
    const opObj = await this.db.insertInstance<Briefcase>(briefcase);
    if (opObj.error)
      return {error: opObj.error};

    const {error} = await this.db.saveChanges();
    if (error)
      return {error};

    return {};
  }

  /** Delete a briefcase */
  public async deleteBriefcase(briefcaseKey: Briefcase): BentleyPromise<DbResult, void> {
    const opObj = await this.db.deleteInstance<Briefcase>(briefcaseKey);
    if (opObj.error)
      return { error: opObj.error };

    return this.db.saveChanges();
  }

  /** Query for a briefcase id */
  private async queryBriefcaseId(iModelId: string, changeSetId?: string|undefined, userId?: string|undefined, accessMode: BriefcaseAccessMode = BriefcaseAccessMode.Shared): BentleyPromise<DbResult, string|undefined> {
    let ecsql = "SELECT ECInstanceId FROM ServiceStore.Briefcase WHERE IModelId=?";

    const bindings = new Array<BindingValue>();
    bindings.push(iModelId);

    if (changeSetId) {
      ecsql = ecsql.concat(" AND ChangeSetId=?");
      bindings.push(changeSetId);
    }

    if (userId) {
      ecsql = ecsql.concat(" AND UserId=?");
      bindings.push(userId);
    }

    if (accessMode) {
      ecsql = ecsql.concat(" AND AccessMode=?");
      bindings.push(accessMode);
    }

    const {error, result: strRows} = await this.db.executeQuery(ecsql, bindings);
    if (error)
      return {error};

    if (!strRows)
      return {result: undefined};

    const jsonRows: any = JSON.parse(strRows);
    if (!jsonRows || jsonRows.length === 0)
      return {result: undefined};

    return {result: jsonRows[0].id};
  }

  /** Get a briefcase given it's id */
  private async getBriefcaseById(briefcaseId: string): BentleyPromise<DbResult, Briefcase|undefined> {
    if (!briefcaseId) {
      return {error: {status: DbResult.BE_SQLITE_ERROR, message: "Invalid briefcaseid"}};
    }

    const instanceKey = new Briefcase();
    instanceKey.id = briefcaseId!;
    return this.db.readInstance<Briefcase>(instanceKey);
  }

}
