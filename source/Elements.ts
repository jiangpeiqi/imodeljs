/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2017 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { Element, ElementProps } from "./Element";
import { Code, IModel, Id } from "./IModel";
import { ClassRegistry } from "./ClassRegistry";
import { LRUMap } from "@bentley/bentleyjs-core/lib/LRUMap";
import { BentleyPromise } from "@bentley/bentleyjs-core/lib/Bentley";
import { DgnDbStatus } from "@bentley/imodeljs-dgnplatform/lib/DgnDb";
import { assert } from "@bentley/bentleyjs-core/lib/Assert";

/** Parameters to specify what element to load. */
export interface ElementLoadParams {
  id?: Id | string;
  code?: Code;
  /** if true, do not load the geometry of the element */
  noGeometry?: boolean;
}

/** The collection of Elements in an iModel  */
export class Elements {
  private _iModel: IModel;
  private _loaded: LRUMap<string, Element>;

  /** get the map of loaded elements */
  public get loaded() { return this._loaded; }

  public constructor(iModel: IModel, maxElements: number = 2000) { this._iModel = iModel; this._loaded = new LRUMap<string, Element>(maxElements); }

  /**
   * Get an element by Id or Code.
   * @param opts  Either the id or the code of the element
   * @returns The Element or undefined if the Id is not found
   */
  public async getElement(opts: ElementLoadParams): BentleyPromise<DgnDbStatus, Element | undefined> {
    // first see if the element is already in the local cache.
    if (opts.id) {
      const loaded = this._loaded.get(opts.id.toString());
      if (loaded)
        return { result: loaded };
    }

    // Must go get the element from the iModel. Start by requesting the element's data.
    const getObj = await this._iModel.dgnDb.getElement(JSON.stringify(opts));
    if (getObj.error || !getObj.result) { // todo: Shouldn't getObj.result always be non-empty if there is no error?
      return { result: undefined }; // we didn't find an element with the specified identity. That's not an error, just an empty result.
    }
    const json = getObj.result;

    const props = JSON.parse(json) as ElementProps;
    props.iModel = this._iModel;

    const elObj = await ClassRegistry.createInstance(props);
    if (elObj.error)
      return { error: elObj.error };

    const el = elObj.result as Element;
    assert(el instanceof Element);

    // We have created the element. Cache it before we return it.
    Object.freeze(el); // elements in the cache must be immutable and in their just-loaded state. Freeze it to enforce that
    this._loaded.set(el.id.toString(), el);
    return { result: el };
  }
}
