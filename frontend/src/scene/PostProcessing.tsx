import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

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
    </EffectComposer>
  );
}
