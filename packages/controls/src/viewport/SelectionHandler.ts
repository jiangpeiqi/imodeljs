/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import { DisposableList, Id64Set, Id64, IDisposable } from "@bentley/bentleyjs-core";
import { IModelConnection, SelectEventType } from "@bentley/imodeljs-frontend";
import { DefaultContentDisplayTypes, KeySet, SelectionInfo } from "@bentley/ecpresentation-common";
import { SelectionHandler as UnifiedSelectionHandler, SelectionChangeEventArgs, ISelectionProvider, ECPresentation } from "@bentley/ecpresentation-frontend";
import ContentDataProvider from "../common/ContentDataProvider";

let counter = 1;

/**
 * @hidden
 */
export default class SelectionHandler implements IDisposable {

  private _imodel: IModelConnection;
  private _rulesetId: string;
  private _disposables = new DisposableList();
  private _selectionHandler: UnifiedSelectionHandler;
  private _selectedElementsProvider: SelectedElementsProvider;
  private _isApplyingUnifiedSelection = false;

  public constructor(imodel: IModelConnection, rulesetId: string) {
    this._imodel = imodel;
    this._rulesetId = rulesetId;

    // handles changing and listening to unified selection
    this._selectionHandler = new UnifiedSelectionHandler(ECPresentation.selection,
      `Viewport_${counter++}`, imodel, rulesetId, this.onUnifiedSelectionChanged);
    this._disposables.add(this._selectionHandler);

    // `imodel.selectionSet` handles changing and listening to viewport selection
    this._disposables.add(imodel.selectionSet.onChanged.addListener(this.onViewportSelectionChanged));

    // handles querying for elements which should be selected in the viewport
    this._selectedElementsProvider = new SelectedElementsProvider(imodel, rulesetId);
  }

  public dispose() {
    this._disposables.dispose();
  }

  public get imodel() { return this._imodel; }
  public set imodel(value: IModelConnection) {
    this._imodel = value;
    this._selectionHandler.imodel = value;
    this._selectedElementsProvider.connection = value;
  }

  public get rulesetId() { return this._rulesetId; }
  public set rulesetId(value: string) {
    this._rulesetId = value;
    this._selectionHandler.rulesetId = value;
    this._selectedElementsProvider.rulesetId = value;
  }

  // tslint:disable-next-line:naming-convention
  private onUnifiedSelectionChanged = async (args: SelectionChangeEventArgs, provider: ISelectionProvider): Promise<void> => {
    // this component only cares about its own imodel
    if (args.imodel !== this._imodel)
      return;

    // viewports are only interested in top-level selection changes
    // wip: may want to handle different selection levels?
    if (0 !== args.level)
      return;

    const selection = provider.getSelection(args.imodel, 0);
    const info: SelectionInfo = {
      providerName: args.source,
      level: args.level,
    };
    const ids = await this._selectedElementsProvider.getElementIds(selection, info);
    try {
      this._isApplyingUnifiedSelection = true;
      args.imodel.selectionSet.replace(ids);
    } finally {
      this._isApplyingUnifiedSelection = false;
    }
  }

  // tslint:disable-next-line:naming-convention
  private onViewportSelectionChanged = async (imodel: IModelConnection, eventType: SelectEventType, ids?: Id64Set): Promise<void> => {
    // don't handle the event if we got here due to us changing the selection
    if (this._isApplyingUnifiedSelection)
      return;

    // this component only cares about its own imodel
    if (imodel !== this._imodel)
      return;

    // determine the level of selection changes
    // wip: may want to allow selecting at different levels?
    const selectionLevel = 0;

    // we know what to do immediately on `clear` events
    if (eventType === SelectEventType.Clear) {
      this._selectionHandler.clearSelection(selectionLevel);
      return;
    }

    // we only have element ids, but ecpresentation requires instance keys (with
    // class names), so have to query
    const elementProps = ids ? await imodel.elements.getProps(ids) : [];

    // report the change
    switch (eventType) {
      case SelectEventType.Add:
        this._selectionHandler.addToSelection(elementProps, selectionLevel);
        break;
      case SelectEventType.Replace:
        this._selectionHandler.replaceSelection(elementProps, selectionLevel);
        break;
      case SelectEventType.Remove:
        this._selectionHandler.removeFromSelection(elementProps, selectionLevel);
        break;
    }
  }
}

class SelectedElementsProvider extends ContentDataProvider {
  public constructor(imodel: IModelConnection, rulesetId: string) {
    super(imodel, rulesetId, DefaultContentDisplayTypes.VIEWPORT);
  }
  public async getElementIds(keys: Readonly<KeySet>, info: SelectionInfo): Promise<Id64[]> {
    this.keys = keys;
    this.selectionInfo = info;

    const content = await this.getContent();
    if (!content)
      return [];

    const ids = new Array<Id64>();
    content.contentSet.forEach((r) => r.primaryKeys.forEach((pk) => ids.push(pk.id)));
    return ids;
  }
}
