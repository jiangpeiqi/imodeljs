/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import * as sinon from "sinon";
import { renderHook, act } from "@testing-library/react-hooks";
import { shallow } from "enzyme";
import { WidgetPanelsToolSettings, useToolSettings, FrontstageManager, FrontstageDef, ZoneDef } from "../../ui-framework";

describe("WidgetPanelsToolSettings", () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  it("should not render w/o tool settings top center zone", () => {
    sandbox.stub(FrontstageManager, "activeFrontstageDef").get(() => undefined);
    const sut = shallow(<WidgetPanelsToolSettings />);
    sut.should.matchSnapshot();
  });

  it("should render", () => {
    const frontstageDef = new FrontstageDef();
    const topCenter = new ZoneDef();
    sandbox.stub(FrontstageManager, "activeFrontstageDef").get(() => frontstageDef);
    sandbox.stub(frontstageDef, "topCenter").get(() => topCenter);
    sandbox.stub(topCenter, "isToolSettings").get(() => true);
    const sut = shallow(<WidgetPanelsToolSettings />);
    sut.should.matchSnapshot();
  });
});

describe("useToolSettings", () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  it("should add tool activated event listener", () => {
    const addListenerSpy = sandbox.spy(FrontstageManager.onToolActivatedEvent, "addListener");
    const removeListenerSpy = sandbox.spy(FrontstageManager.onToolActivatedEvent, "removeListener");
    const sut = renderHook(() => useToolSettings());
    sut.unmount();
    addListenerSpy.calledOnce.should.true;
    removeListenerSpy.calledOnce.should.true;
  });

  it("should update tool settings", () => {
    sandbox.stub(FrontstageManager, "activeToolSettingsNode").get(() => <></>);
    const sut = renderHook(() => useToolSettings());

    const node = <></>;
    act(() => {
      sandbox.stub(FrontstageManager, "activeToolSettingsNode").get(() => node);
      FrontstageManager.onToolActivatedEvent.emit({
        toolId: "",
      });
    });

    sut.result.current!.should.eq(node);
  });
});