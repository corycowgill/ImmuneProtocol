// Writes a copy of a meshopt-compressed .glb without the compression, so Blender can import it
// for render_subjects.py. Run from a folder with @gltf-transform/core, @gltf-transform/extensions
// and meshoptimizer installed:  node decode_models.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [input, output] = process.argv.slice(2);
const doc = await io.read(input);
for (const ext of doc.getRoot().listExtensionsUsed()) if (/meshopt/.test(ext.extensionName)) ext.dispose();
await io.write(output, doc);
console.log('decoded', output);
