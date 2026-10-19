import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { Film } from "./Film";
import { DURATION, FPS, H, W } from "./theme";

export const Root: React.FC = () => (
  <Composition id="SidePocket" component={Film} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
);
