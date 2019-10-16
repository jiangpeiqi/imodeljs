/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { Logger, Id64Array } from "@bentley/bentleyjs-core";
import { Point2d, XYAndZ, XAndY, Point3d, ClipVector } from "@bentley/geometry-core";
import { SectionLocationProps, SectionType } from "@bentley/imodeljs-common";
import { NotifyMessageDetails, OutputMessagePriority, OutputMessageType, Viewport, ScreenViewport, ViewClipTool, Marker, BeButtonEvent, BeButton, DecorateContext, Cluster, MarkerImage, MarkerSet, IModelApp, imageElementFromUrl } from "@bentley/imodeljs-frontend";
import { HyperModelingPlugin } from "./HyperModeling";

/** Marker to show a section location.
 * @beta
 */
class SectionLocation extends Marker {
  private static _size = Point2d.create(40, 40);
  private _clip?: ClipVector;

  /** Create a new SectionLocation */
  constructor(public props: SectionLocationProps, pos: Point3d, title: string, icon: HTMLImageElement) {
    super(pos, SectionLocation._size);
    this.setImage(icon);
    this.title = title;
    this.setScaleFactor({ low: .2, high: 1.4 }); // make size 20% at back of frustum and 140% at front of frustum (if camera is on)
  }

  private get clip(): ClipVector {
    if (undefined === this._clip)
      this._clip = ClipVector.fromJSON(JSON.parse(this.props.clipGeometry));
    return this._clip;
  }

  public onMouseButton(ev: BeButtonEvent): boolean {
    if (BeButton.Data !== ev.button || !ev.isDown || !ev.viewport || !ev.viewport.view.isSpatialView())
      return true;
    ViewClipTool.enableClipVolume(ev.viewport);
    ViewClipTool.setViewClip(ev.viewport, this.clip !== ev.viewport.view.getViewClip() ? this.clip : undefined);
    return true; // Don't allow clicks to be sent to active tool...
  }

  public addMarker(context: DecorateContext) {
    super.addMarker(context);
    if (!this._isHilited || undefined === this.props.clipGeometry)
      return;
    ViewClipTool.drawClip(context, this.clip);
  }
}

/** A Marker used to show a cluster of section locations.
 * @beta
 */
class SectionLocationClusterMarker extends Marker {
  /** Create a new cluster marker */
  constructor(location: XYAndZ, size: XAndY, cluster: Cluster<SectionLocation>, image: Promise<MarkerImage>) {
    super(location, size);

    this.imageOffset = new Point3d(0, 30);
    this.label = cluster.markers.length.toLocaleString();
    this.labelColor = "black";
    this.labelFont = "bold 14px san-serif";

    const maxLen = 10;
    let title = "";
    cluster.markers.forEach((marker, index: number) => {
      if (index < maxLen) {
        if (title !== "")
          title += "<br>";
        title += marker.title;
      }
    });
    if (cluster.markers.length > maxLen)
      title += "<br>...";

    const div = document.createElement("div");
    div.innerHTML = title;
    this.title = div;
    this.setImage(image);
  }

  /** Show the cluster as a white circle with an outline */
  public drawFunc(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.strokeStyle = "#372528";
    ctx.fillStyle = "white";
    ctx.lineWidth = 5;
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  public onMouseButton(_ev: BeButtonEvent): boolean { return true; } // Don't allow clicks to be sent to active tool...
}

/** A MarkerSet to hold section locations. This class supplies to `getClusterMarker` method to create SectionLocationClusterMarkers.
 * @beta
 */
class SectionLocationSet extends MarkerSet<SectionLocation> {
  public minimumClusterSize = 5;
  protected getClusterMarker(cluster: Cluster<SectionLocation>): Marker { return SectionLocationClusterMarker.makeFrom(cluster.markers[0], cluster, SectionLocationSetDecoration.decorator!.sectionMarkerImage); }
}

/**
 * @beta
 */
export class SectionLocationSetDecoration {
  private _sectionLocations: SectionLocationSet;
  public detailMarkerImage?: HTMLImageElement;
  public elevationMarkerImage?: HTMLImageElement;
  public planMarkerImage?: HTMLImageElement;
  public static decorator?: SectionLocationSetDecoration; // static variable so we can tell if the decorator is active.
  public static plugin: HyperModelingPlugin | undefined;

  public constructor(vp: ScreenViewport, public sectionMarkerImage: HTMLImageElement) { this._sectionLocations = new SectionLocationSet(vp); }

  private getMarkerImage(props: SectionLocationProps): HTMLImageElement {
    switch (props.sectionType) {
      case SectionType.Detail:
        return (undefined !== this.detailMarkerImage ? this.detailMarkerImage : this.sectionMarkerImage);
      case SectionType.Elevation:
        return (undefined !== this.elevationMarkerImage ? this.elevationMarkerImage : this.sectionMarkerImage);
      case SectionType.Plan:
        return (undefined !== this.planMarkerImage ? this.planMarkerImage : this.sectionMarkerImage);
      default:
        return this.sectionMarkerImage;
    }
  }

  private getMarkerTitle(props: SectionLocationProps): string {
    if (undefined !== props.userLabel)
      return props.userLabel;
    switch (props.sectionType) {
      case SectionType.Detail:
        return SectionLocationSetDecoration.plugin!.i18n.translate("HyperModeling:tools.SectionLocationMarkers.Messages.DetailCallout");
      case SectionType.Elevation:
        return SectionLocationSetDecoration.plugin!.i18n.translate("HyperModeling:tools.SectionLocationMarkers.Messages.ElevationCallout");
      case SectionType.Plan:
        return SectionLocationSetDecoration.plugin!.i18n.translate("HyperModeling:tools.SectionLocationMarkers.Messages.PlanCallout");
      default:
        return SectionLocationSetDecoration.plugin!.i18n.translate("HyperModeling:tools.SectionLocationMarkers.Messages.SectionCallout");
    }
  }

  /** Populate marker set from section locations */
  public createMarkers(secLocPropList: SectionLocationProps[]): void {
    const pos = new Point3d();
    secLocPropList.forEach((secLocProps) => {
      if (undefined !== secLocProps.placement && undefined !== secLocProps.clipGeometry) {
        pos.setFromJSON(secLocProps.placement!.origin);
        this._sectionLocations.markers.add(new SectionLocation(secLocProps, pos, this.getMarkerTitle(secLocProps), this.getMarkerImage(secLocProps)));
      }
    });
  }

  /** Set marker visibility based on category display */
  public setMarkerVisibility(vp: Viewport, outputMsg: boolean = true): boolean {
    // ###TODO Check display filters for category, section type, etc...
    let haveVisibleCategory = false;
    for (const marker of this._sectionLocations.markers) {
      marker.visible = vp.view.viewsCategory(marker.props.category);
      if (marker.visible)
        haveVisibleCategory = true;
    }
    if (outputMsg && !haveVisibleCategory) {
      const msg = SectionLocationSetDecoration.plugin!.i18n.translate("HyperModeling::tools.SectionLocationMarkers.Messages.NotFoundCategories");
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, msg, undefined, OutputMessageType.Toast));
    }
    return haveVisibleCategory;
  }

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. We add the MarkerSet. */
  public decorate(context: DecorateContext): void {
    if (context.viewport.view.isSpatialView())
      this._sectionLocations.addDecoration(context);
  }

  // Load one image, logging if there was an error
  private static async loadImage(src: string): Promise<HTMLImageElement | undefined> {
    try {
      return await imageElementFromUrl(src); // note: "return await" is necessary inside try/catch
    } catch (err) {
      Logger.logError("SectionLocationSetDecoration", "Could not load image " + src);
    }
    return undefined;
  }

  /** Stop showing markers if currently active. */
  public static clear(): void {
    if (undefined === SectionLocationSetDecoration.decorator)
      return;
    IModelApp.viewManager.dropDecorator(SectionLocationSetDecoration.decorator);
    SectionLocationSetDecoration.decorator = undefined;
  }

  /** Start showing markers if not currently active (or optionally refresh when currently displayed). */
  public static async show(plugin: HyperModelingPlugin, vp: ScreenViewport, sync: boolean, update: boolean): Promise<void> {
    SectionLocationSetDecoration.plugin = plugin;
    if (undefined !== SectionLocationSetDecoration.decorator) {
      const currentVp = SectionLocationSetDecoration.decorator._sectionLocations.viewport;
      if (currentVp && currentVp !== vp) {
        if (sync || update)
          vp = currentVp;
        else
          update = true; // clear and show in new view...
      }
      if (!update) {
        if (sync) {
          SectionLocationSetDecoration.decorator.setMarkerVisibility(vp);
          SectionLocationSetDecoration.decorator._sectionLocations.markDirty();
        }
        return;
      }
      this.clear();
    } else if (sync || update) {
      return;
    }

    if (!vp.view.isSpatialView())
      return;

    const sectionMarkerImage = await this.loadImage(SectionLocationSetDecoration.plugin.resolveResourceUrl("sectionmarkersprite.ico"));
    if (undefined === sectionMarkerImage)
      return; // No point continuing if we don't have a marker image to show...

    const modelIds = new Set<string>();
    vp.view.forEachModel((model) => { modelIds.add(model.id); });
    if (0 === modelIds.size)
      return;

    let secLocPropList;
    const where = [...modelIds].join(",");
    const ecsql = "SELECT ECInstanceId as id FROM BisCore.SectionLocation WHERE Model.Id IN (" + where + ")";
    try {
      const secLocIds: Id64Array = [];
      for await (const row of vp.view.iModel.query(ecsql))
        secLocIds.push(row.id);
      if (0 !== secLocIds.length)
        secLocPropList = await vp.view.iModel.elements.getProps(secLocIds) as SectionLocationProps[];
    } catch (_) { }

    if (undefined === secLocPropList || 0 === secLocPropList.length) {
      const msg = SectionLocationSetDecoration.plugin.i18n.translate("HyperModeling:tools.SectionLocationMarkers.Messages.NotFoundModels");
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, msg, undefined, OutputMessageType.Toast));
      return;
    }

    // Start by creating the decoration object and adding it as a ViewManager decorator.
    SectionLocationSetDecoration.decorator = new SectionLocationSetDecoration(vp, sectionMarkerImage);
    SectionLocationSetDecoration.decorator.detailMarkerImage = await this.loadImage(SectionLocationSetDecoration.plugin.resolveResourceUrl("detailmarkersprite.ico"));
    SectionLocationSetDecoration.decorator.elevationMarkerImage = await this.loadImage(SectionLocationSetDecoration.plugin.resolveResourceUrl("elevationmarkersprite.ico"));
    SectionLocationSetDecoration.decorator.planMarkerImage = await this.loadImage(SectionLocationSetDecoration.plugin.resolveResourceUrl("planmarkersprite.ico"));
    SectionLocationSetDecoration.decorator.createMarkers(secLocPropList);

    if (0 === SectionLocationSetDecoration.decorator._sectionLocations.markers.size) {
      const msg = SectionLocationSetDecoration.plugin.i18n.translate("HyperModeling:tools.SectionLocationMarkers.Messages.NotFoundModels");
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, msg, undefined, OutputMessageType.Toast));
      return;
    }

    SectionLocationSetDecoration.decorator.setMarkerVisibility(vp);
    IModelApp.viewManager.addDecorator(SectionLocationSetDecoration.decorator);
    vp.onChangeView.addOnce(() => this.clear());
  }
}