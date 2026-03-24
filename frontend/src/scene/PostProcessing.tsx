import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Vector2 } from "three";

const CHROMA_OFFSET = new Vector2(0.0004, 0.0004);

export function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.92}
        luminanceSmoothing={0.4}
        intensity={0.15}
        mipmapBlur
      />
      <Vignette offset={0.25} darkness={0.5} />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={CHROMA_OFFSET}
        radialModulation={false}
        modulationOffset={0.0}
      />
    </EffectComposer>
  );
}
