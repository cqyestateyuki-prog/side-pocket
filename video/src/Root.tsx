import React from "react";
import { Composition, Still } from "remotion";
import "./fonts";
import { COVER, Cover } from "./Cover";
import { Film } from "./Film";
import { DURATION, FPS, H, W } from "./theme";

export const Root: React.FC = () => (
  <>
    <Composition id="SidePocket" component={Film} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
    <Still id="Cover" component={Cover} defaultProps={COVER} width={W} height={H} />
    <Still id="Cover1610" component={Cover} defaultProps={COVER} width={W} height={1200} />
  </>
);
