import { ShaderPatcher } from "../utils/shader-patcher.js";
import lightingUniformGroup from "./lighting-uniforms.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.once("canvasInit", () => {
        const cache = new WeakMap();

        libWrapper.register(
            "perfect-vision",
            "canvas.primary.sprite.setShaderClass",
            function (wrapped, shaderCls, ...args) {
                if (shaderCls !== BaseSamplerShader) {
                    if (cache.has(shaderCls)) {
                        shaderCls = cache.get(shaderCls);
                    } else {
                        let patchedShaderCls;

                        try {
                            patchedShaderCls = class extends shaderCls {
                                /** @override */
                                static name = `PerfectVision.Canvas.${super.name}`;

                                /** @override */
                                static classPluginName = null;

                                /** @override */
                                static vertexShader = new ShaderPatcher("vert")
                                    .setSource(super.vertexShader)
                                    .addUniform("screenDimensions", "vec2")
                                    .addVarying("vUvsMask", "vec2")
                                    .wrapMain(`\
                                    void main() {
                                        vUvsMask = aVertexPosition / screenDimensions;

                                        @main();
                                    }
                                ` + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n"))
                                    .getSource();

                                /** @override */
                                static fragmentShader = new ShaderPatcher("frag")
                                    .setSource(super.fragmentShader)
                                    .addVarying("vUvsMask", "vec2")
                                    .addUniform("darknessLevelTexture", "sampler2D")
                                    .overrideVariable("darknessLevel")
                                    .wrapMain(`\
                                    void main() {
                                        darknessLevel = texture2D(darknessLevelTexture, vUvsMask).r;

                                        @main();
                                    }
                                ` + (PerfectVision.debug ? "" : "#define OPTIMIZE_GLSL\n"))
                                    .getSource();

                                /** @override */
                                static defaultUniforms = foundry.utils.mergeObject(
                                    super.defaultUniforms,
                                    {
                                        darknessLevelTexture: 0,
                                        screenDimensions: [1, 1]
                                    },
                                    { inplace: false }
                                );

                                /** @override */
                                _preRender(mesh) {
                                    super._preRender(mesh);

                                    const uniforms = this.uniforms;

                                    uniforms.screenDimensions = canvas.screenDimensions;
                                    uniforms.darknessLevelTexture = lightingUniformGroup.uniforms.darknessLevelTexture;
                                }
                            };
                        } finally {
                            cache.set(shaderCls, shaderCls = patchedShaderCls ?? shaderCls);
                        }
                    }
                }

                return wrapped(shaderCls, ...args);
            },
            libWrapper.WRAPPER
        );
    });
});