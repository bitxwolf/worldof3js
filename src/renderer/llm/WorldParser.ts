import { transport } from '../../shared/transport';
import type { ParseWorldPayload } from '../../shared/ipc.types';
import {
  SceneGraphSchema,
  type SceneGraph,
} from '../../shared/schema/sceneGraph.schema';
import { LLMParseError, ValidationError } from '../../shared/errors';

export async function parseWorld(input: ParseWorldPayload): Promise<SceneGraph> {
  const result = await transport.parseWorld(input);

  if (!result.success) {
    throw new LLMParseError(result.error.message, '');
  }

  const validated = SceneGraphSchema.safeParse(result.data);
  if (!validated.success) {
    throw new ValidationError(
      'Scene graph returned by LLM failed client validation.',
      validated.error.issues
    );
  }

  return validated.data;
}
