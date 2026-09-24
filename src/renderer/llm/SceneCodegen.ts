import { transport } from '../../shared/transport';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';
import { SceneBuildError } from '../../shared/errors';

export async function generateCode(graph: SceneGraph): Promise<string> {
  const result = await transport.generateCode(graph);

  if (!result.success) {
    throw new SceneBuildError(result.error.message, '');
  }

  return result.data;
}
