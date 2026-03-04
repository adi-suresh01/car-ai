import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Vector2 } from "three";

const CHROMA_OFFSET = new Vector2(0.0006, 0.0006);

export function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.8}
        luminanceSmoothing={0.3}
        intensity={0.4}
        mipmapBlur
      />
      <Vignette offset={0.3} darkness={0.55} />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={CHROMA_OFFSET}
        radialModulation={false}
        modulationOffset={0.0}
      />
    </EffectComposer>
  );
}
