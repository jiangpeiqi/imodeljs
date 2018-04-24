/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Views */

import { Range2d, Range3d } from "@bentley/geometry-core";
import { Point2d, Point3d } from "@bentley/geometry-core";
import { assert } from "@bentley/bentleyjs-core";

namespace Quantization {
  const rangeScale = 0xffff;

  export function computeScale(extent: number): number { return 0.0 === extent ? extent : rangeScale / extent; }
  export function isInRange(qpos: number) { return qpos >= 0.0 && qpos < rangeScale + 1.0; }
  export function quantize(pos: number, origin: number, scale: number) { return Math.floor(Math.max(0.0, Math.min(rangeScale, 0.5 + (pos - origin) * scale))); }
  export function isQuantizable(pos: number, origin: number, scale: number) { return isInRange(quantize(pos, origin, scale)); }
  export function unquantize(qpos: number, origin: number, scale: number) { return 0.0 === scale ? origin : origin + qpos / scale; }
  export function isQuantized(qpos: number) { return isInRange(qpos) && qpos === Math.floor(qpos); }
}

export class QParams2d {
  public readonly origin = new Point2d();
  public readonly scale = new Point2d();

  private constructor(ox = 0, oy = 0, sx = 0, sy = 0) { this.setFrom(ox, oy, sx, sy); }

  private setFrom(ox: number, oy: number, sx: number, sy: number) {
    this.origin.x = ox;
    this.origin.y = oy;
    this.scale.x = sx;
    this.scale.y = sy;
  }

  public copyFrom(src: QParams2d) { this.setFrom(src.origin.x, src.origin.y, src.scale.x, src.scale.y); }
  public clone(out?: QParams2d) {
    const result = undefined !== out ? out : new QParams2d();
    result.copyFrom(this);
    return result;
  }

  public setFromRange(range: Range2d) {
    if (!range.isNull) {
      this.setFrom(range.low.x, range.low.y, Quantization.computeScale(range.high.x - range.low.x), Quantization.computeScale(range.high.y - range.low.y));
    } else {
      this.origin.x = this.origin.y = this.scale.x = this.scale.y = 0;
    }
  }
  public static fromRange(range: Range2d, out?: QParams2d) {
    const params = undefined !== out ? out : new QParams2d();
    params.setFromRange(range);
    return params;
  }
  public static fromNormalizedRange() { return QParams2d.fromRange(Range2d.createArray([Point2d.create(-1, -1), Point2d.create(1, 1)])); }
  public static fromZeroToOne() { return QParams2d.fromRange(Range2d.createArray([Point2d.create(0, 0), Point2d.create(1, 1)])); }
}

export class QPoint2d {
  private _x: number = 0;
  private _y: number = 0;

  public get x() { return this._x; }
  public set x(x: number) { assert(Quantization.isQuantized(x)); this._x = x; }
  public get y() { return this._y; }
  public set y(y: number) { assert(Quantization.isQuantized(y)); this._y = y; }

  private constructor() { }

  public init(pos: Point2d, params: QParams2d) {
    this.x = Quantization.quantize(pos.x, params.origin.x, params.scale.x);
    this.y = Quantization.quantize(pos.y, params.origin.y, params.scale.y);
  }
  public static create(pos: Point2d, params: QParams2d) {
    const qpt = new QPoint2d();
    qpt.init(pos, params);
    return qpt;
  }

  public copyFrom(src: QPoint2d) {
    this.x = src.x;
    this.y = src.y;
  }
  public clone(out?: QPoint2d) {
    const result = undefined !== out ? out : new QPoint2d();
    result.copyFrom(this);
    return result;
  }

  public setFromScalars(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  public static fromScalars(x: number, y: number) {
    const pt = new QPoint2d();
    pt.setFromScalars(x, y);
    return pt;
  }

  public unquantize(params: QParams2d, out?: Point2d): Point2d {
    const pt: Point2d = undefined !== out ? out : new Point2d();
    pt.x = Quantization.unquantize(this.x, params.origin.x, params.scale.x);
    pt.y = Quantization.unquantize(this.y, params.origin.y, params.scale.y);
    return pt;
  }
}

export class QPoint2dList {
  public readonly params: QParams2d;
  private readonly _list = new Array<QPoint2d>();

  public constructor(params: QParams2d) {
    this.params = params.clone();
  }

  public clear() { this._list.length = 0; }
  public reset(params: QParams2d) { this.clear(); this.params.copyFrom(params); }

  public add(pt: Point2d) { this._list.push(QPoint2d.create(pt, this.params)); }
  public push(qpt: QPoint2d) { this._list.push(qpt.clone()); }

  public get length() { return this._list.length; }

  public unquantize(index: number, out?: Point2d): Point2d {
    assert(index < this.length);
    if (index < this.length) {
      return this._list[index].unquantize(this.params, out);
    } else {
      return undefined !== out ? out : new Point2d();
    }
  }

  public requantize(params: QParams2d) {
    for (let i = 0; i < this.length; i++) {
      const pt = this.unquantize(i);
      this._list[i].init(pt, params);
    }

    this.params.copyFrom(params);
  }

  public toTypedArray(): Uint16Array {
    const array = new Uint16Array(this.length * 2);
    const pts = this._list;
    for (let i = 0; i < this.length; i++) {
      const pt = pts[i];
      array[i * 2] = pt.x;
      array[i * 2 + 1] = pt.y;
    }

    return array;
  }
}

export class QParams3d {
  public readonly origin = new Point3d();
  public readonly scale = new Point3d();

  private constructor(ox = 0, oy = 0, oz = 0, sx = 0, sy = 0, sz = 0) { this.setFrom(ox, oy, oz, sx, sy, sz); }

  private setFrom(ox: number, oy: number, oz: number, sx: number, sy: number, sz: number) {
    this.origin.x = ox;
    this.origin.y = oy;
    this.origin.z = oz;
    this.scale.x = sx;
    this.scale.y = sy;
    this.scale.z = sz;
  }

  public copyFrom(src: QParams3d) { this.setFrom(src.origin.x, src.origin.y, src.origin.z, src.scale.x, src.scale.y, src.scale.z); }
  public clone(out?: QParams3d) {
    const result = undefined !== out ? out : new QParams3d();
    result.copyFrom(this);
    return result;
  }

  public setFromRange(range: Range3d) {
    if (!range.isNull) {
      this.setFrom(range.low.x, range.low.y, range.low.z,
      Quantization.computeScale(range.high.x - range.low.x), Quantization.computeScale(range.high.y - range.low.y), Quantization.computeScale(range.high.z - range.low.z));
    } else {
      this.origin.x = this.origin.y = this.origin.z = 0;
      this.scale.x = this.scale.y = this.scale.z = 0;
    }
  }
  public static fromRange(range: Range3d, out?: QParams3d) {
    const params = undefined !== out ? out : new QParams3d();
    params.setFromRange(range);
    return params;
  }
  public static fromNormalizedRange() { return QParams3d.fromRange(Range3d.createArray([Point3d.create(-1, -1, -1), Point3d.create(1, 1, 1)])); }
  public static fromZeroToOne() { return QParams3d.fromRange(Range3d.createArray([Point3d.create(0, 0, 0), Point3d.create(1, 1, 1)])); }
}

export class QPoint3d {
  private _x: number = 0;
  private _y: number = 0;
  private _z: number = 0;

  public get x() { return this._x; }
  public set x(x: number) { assert(Quantization.isQuantized(x)); this._x = x; }
  public get y() { return this._y; }
  public set y(y: number) { assert(Quantization.isQuantized(y)); this._y = y; }
  public get z() { return this._z; }
  public set z(z: number) { assert(Quantization.isQuantized(z)); this._z = z; }

  private constructor() { }

  public init(pos: Point3d, params: QParams3d) {
    this.x = Quantization.quantize(pos.x, params.origin.x, params.scale.x);
    this.y = Quantization.quantize(pos.y, params.origin.y, params.scale.y);
    this.z = Quantization.quantize(pos.z, params.origin.z, params.scale.z);
  }
  public static create(pos: Point3d, params: QParams3d) {
    const qpt = new QPoint3d();
    qpt.init(pos, params);
    return qpt;
  }

  public copyFrom(src: QPoint3d) {
    this.x = src.x;
    this.y = src.y;
    this.z = src.z;
  }
  public clone(out?: QPoint3d) {
    const result = undefined !== out ? out : new QPoint3d();
    result.copyFrom(this);
    return result;
  }

  public setFromScalars(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  public static fromScalars(x: number, y: number, z: number) {
    const pt = new QPoint3d();
    pt.setFromScalars(x, y, z);
    return pt;
  }

  public unquantize(params: QParams3d, out?: Point3d): Point3d {
    const pt: Point3d = undefined !== out ? out : new Point3d();
    pt.x = Quantization.unquantize(this.x, params.origin.x, params.scale.x);
    pt.y = Quantization.unquantize(this.y, params.origin.y, params.scale.y);
    pt.z = Quantization.unquantize(this.z, params.origin.z, params.scale.z);
    return pt;
  }
}

export class QPoint3dList {
  public readonly params: QParams3d;
  private readonly _list = new Array<QPoint3d>();

  public constructor(params: QParams3d) {
    this.params = params.clone();
  }

  public clear() { this._list.length = 0; }
  public reset(params: QParams3d) { this.clear(); this.params.copyFrom(params); }

  public add(pt: Point3d) { this._list.push(QPoint3d.create(pt, this.params)); }
  public push(qpt: QPoint3d) { this._list.push(qpt.clone()); }

  public get length() { return this._list.length; }

  public unquantize(index: number, out?: Point3d): Point3d {
    assert(index < this.length);
    if (index < this.length) {
      return this._list[index].unquantize(this.params, out);
    } else {
      return undefined !== out ? out : new Point3d();
    }
  }

  public requantize(params: QParams3d) {
    for (let i = 0; i < this.length; i++) {
      const pt = this.unquantize(i);
      this._list[i].init(pt, params);
    }

    this.params.copyFrom(params);
  }

  public toTypedArray(): Uint16Array {
    const array = new Uint16Array(this.length * 3);
    const pts = this._list;
    for (let i = 0; i < this.length; i++) {
      const pt = pts[i];
      array[i * 3 + 0] = pt.x;
      array[i * 3 + 1] = pt.y;
      array[i * 3 + 2] = pt.z;
    }

    return array;
  }
}
