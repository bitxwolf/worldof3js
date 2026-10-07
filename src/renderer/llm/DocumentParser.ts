/**
 * DocumentParser.ts
 * Story Document Parsing & Intelligent Chunking for Orbis World Engine (Phase 4).
 *
 * Implements chunking strategy for long documents:
 * - Under 50K chars: sends full text directly.
 * - Over 50K chars: extracts chapter headings, character dossiers, location
 *   descriptions, and narrative milestones to produce a dense story bible under 50K chars.
 */

export interface ParsedDocumentResult {
  text: string;
  isChunked: boolean;
  originalLength: number;
  extractedChapters: string[];
  extractedCharacters: string[];
  summary?: string;
}

export const MAX_DOCUMENT_CHARS = 50_000;

const NON_CHARACTER_WORDS = new Set([
  'note',
  'notes',
  'warning',
  'tip',
  'hint',
  'summary',
  'chapter',
  'act',
  'scene',
  'part',
  'book',
  'location',
  'setting',
  'time',
  'date',
  'description',
  'cast',
  'characters',
  'prologue',
  'epilogue',
  'caution',
  'important',
  'source',
  'author',
]);

/**
 * Extracts chapter and section headings from markdown, screenplay, or prose text.
 * Strictly avoids false positives from prose sentences like "Part of the forest..." or "Act quickly...".
 */
export function extractChapters(content: string): string[] {
  const headings: string[] = [];
  const lines = content.split('\n');

  // Match Markdown headings: # The Whispering Woods, ## Chapter 2
  const mdHeadingRegex = /^#{1,3}\s+(.+)$/;

  // Match explicit chapter labels:
  // "Chapter 1: The Gathering", "Act II - The King", "Scene 3: The Crypt", "Part 1 - The Journey"
  const chapterNumberRegex = /^(?:Chapter|Act|Scene|Part|Book|Episode)\s+(?:([0-9IVXLCDM]+|[A-Z])\b(?:\s*[:–—.\s]\s*(.*))?|[:–—]\s*(.*))$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 120) continue;

    // Check markdown header
    const mdMatch = mdHeadingRegex.exec(trimmed);
    if (mdMatch) {
      let title = mdMatch[1].trim();
      const subMatch = /^(?:(?:Chapter|Act|Scene|Part|Book|Episode)\s+[0-9IVXLCDM\w]+|[0-9IVXLCDM\w]+)\s*[:–—-]\s*(.+)$/i.exec(title);
      if (subMatch && subMatch[1].trim().length > 0) {
        title = subMatch[1].trim();
      }
      if (title.length > 0 && !headings.includes(title)) {
        headings.push(title);
      }
      continue;
    }

    // Check structured chapter / act / scene heading
    const chMatch = chapterNumberRegex.exec(trimmed);
    if (chMatch) {
      // Subtitle if available (e.g. "The Broken Spire") or full heading (e.g. "Chapter 1")
      const subtitle = (chMatch[2] || chMatch[3] || '').trim();
      let heading = subtitle.length > 0 ? subtitle : trimmed;
      if (heading.length > 0 && !headings.includes(heading)) {
        headings.push(heading);
      }
    }
  }

  return headings;
}

/**
 * Heuristically extracts character mentions and descriptions.
 * Filters out common narrative false positives (Note:, Warning:, etc.).
 */
export function extractCharacters(content: string): string[] {
  const characters = new Set<string>();
  const lines = content.split('\n');

  // Regex patterns for dialogue speaker tags: "Mira: Hello" or "Mira: "Hello""
  const dialogueRegex = /^([A-Z][a-zA-Z\s]{1,24}):\s*(?:["“'‘«]?(.*?)[”'’»]?)?$/;
  const introRegex = /(?:Character[s]?|Dramatis Personae|Cast|Protagonist|Antagonist):\s*([^\n]+)/i;
  const namedEntityRegex = /\b(?:Captain|Lord|Lady|King|Queen|Prince|Princess|Doctor|Dr\.|Professor|Sir|Dame|Elder|Witch|Wizard|Ranger|Blacksmith)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  const titleAfterRegex = /\b([A-Z][a-z]+)\s+the\s+(?:Ranger|Sorceress|Wizard|Witch|Blacksmith|Warrior|Knight|King|Queen|Prince|Princess|Elder|Alchemist|Hunter|Guard|Guardian|Thief|Rogue|Priest|Cleric|Paladin|Monk|Druid|Bard|Mage|Necromancer|Lord|Lady|Captain)\b/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check dialogue speaker
    const dMatch = dialogueRegex.exec(trimmed);
    if (dMatch) {
      let name = dMatch[1].trim();
      const speechVerbs = /\s+(?:said|whispered|shouted|yelled|replied|asked|exclaimed|muttered|called|murmured|cried|sighed|laughed|screamed|groaned)$/i;
      name = name.replace(speechVerbs, '').trim();
      if (name.length > 1 && name.length < 25 && !NON_CHARACTER_WORDS.has(name.toLowerCase())) {
        characters.add(name);
      }
    }

    // Check character list headers
    const iMatch = introRegex.exec(trimmed);
    if (iMatch) {
      const names = iMatch[1].split(/[,;•|]/);
      for (const n of names) {
        // Strip out descriptors like "(sorceress)" or "and"
        const cleanName = n.replace(/\b(?:and|with)\b/gi, '').replace(/\([^)]*\)/g, '').trim();
        if (cleanName.length > 1 && cleanName.length < 30 && !NON_CHARACTER_WORDS.has(cleanName.toLowerCase())) {
          characters.add(cleanName);
        }
      }
    }

    // Check honorifics / titles preceding name
    let eMatch: RegExpExecArray | null;
    while ((eMatch = namedEntityRegex.exec(trimmed)) !== null) {
      if (eMatch[0] && eMatch[0].length < 35) {
        characters.add(eMatch[0].trim());
      }
    }

    // Check titles succeeding name (e.g. Eldrin the Ranger)
    let aMatch: RegExpExecArray | null;
    while ((aMatch = titleAfterRegex.exec(trimmed)) !== null) {
      if (aMatch[1] && aMatch[1].length > 1 && aMatch[1].length < 35) {
        characters.add(aMatch[1].trim());
      }
    }
  }

  return Array.from(characters).slice(0, 25);
}

/**
 * Extracts descriptive paragraphs mentioning environmental features or locations.
 */
export function extractWorldLore(content: string): string[] {
  const loreSnippets: string[] = [];
  const paragraphs = content.split(/\r?\n+/);

  const worldKeywords = [
    'castle', 'tower', 'forest', 'valley', 'mountain', 'temple', 'dungeon',
    'ruin', 'cavern', 'river', 'lake', 'ocean', 'village', 'city', 'hut',
    'fortress', 'shrine', 'desert', 'tundra', 'swamp', 'kingdom', 'island',
    'sanctuary', 'crypt', 'cathedral', 'monastery', 'forge', 'tavern'
  ];

  for (const para of paragraphs) {
    const pTrim = para.trim();
    if (pTrim.length < 30 || pTrim.length > 800) continue;

    const pLower = pTrim.toLowerCase();
    const matchesKeyword = worldKeywords.some((kw) => pLower.includes(kw));

    if (matchesKeyword) {
      loreSnippets.push(pTrim);
    }
  }

  return loreSnippets;
}

/**
 * Main Document Parser entrypoint.
 * Evaluates document length and applies intelligent chunking / extraction if > 50K chars.
 */
export async function parseDocument(
  rawText: string,
  filename?: string
): Promise<ParsedDocumentResult> {
  const originalLength = rawText.length;
  const trimmed = rawText.trim();

  // Handle empty document
  if (trimmed.length === 0) {
    return {
      text: '',
      isChunked: false,
      originalLength,
      extractedChapters: [],
      extractedCharacters: [],
    };
  }

  const chapters = extractChapters(trimmed);
  const characters = extractCharacters(trimmed);

  // If under 50K characters, send full text directly
  if (originalLength <= MAX_DOCUMENT_CHARS) {
    return {
      text: trimmed,
      isChunked: false,
      originalLength,
      extractedChapters: chapters,
      extractedCharacters: characters,
    };
  }

  // Over 50K characters: Smart chunking and story bible extraction
  const lore = extractWorldLore(trimmed);

  // Take introduction (first 8K chars)
  const introSection = trimmed.slice(0, 8000).trim();

  // Take ending / climax (last 6K chars)
  const endingSection = trimmed.slice(-6000).trim();

  // Sample key lore paragraphs up to 16K chars
  let sampledLore = '';
  for (const snippet of lore) {
    if (sampledLore.length + snippet.length + 2 > 16_000) break;
    sampledLore += snippet + '\n\n';
  }

  // Sample intermediate milestones from the middle of the document
  let middleSection = '';
  const remainingBudget = MAX_DOCUMENT_CHARS - (introSection.length + endingSection.length + sampledLore.length + 4000);
  if (remainingBudget > 5000 && originalLength > 20000) {
    const midStart = Math.floor(originalLength / 2) - Math.floor(remainingBudget / 2);
    const midEnd = midStart + Math.min(remainingBudget, 12000);
    middleSection = `\nMID-STORY NARRATIVE HIGHLIGHTS:\n${trimmed.slice(midStart, midEnd).trim()}\n`;
  }

  // Construct structured condensed story bible
  const header = `[STORY BIBLE EXTRACTED FROM: ${filename || 'Document'} (${Math.round(originalLength / 1000)}k characters)]\n`;
  const chaptersSummary = chapters.length > 0
    ? `CHAPTERS & MILESTONES (${chapters.length}):\n${chapters.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}\n\n`
    : '';
  const charactersSummary = characters.length > 0
    ? `PRIMARY CHARACTERS & FIGURES:\n${characters.map((c) => `  • ${c}`).join('\n')}\n\n`
    : '';

  const worldSection = sampledLore.trim().length > 0
    ? `KEY WORLD LOCATIONS & SETTINGS:\n${sampledLore.trim()}\n\n`
    : '';

  const prologueSection = `OPENING EXCERPT:\n${introSection}\n\n`;
  const epilogueSection = `LATER NARRATIVE MILESTONES:\n${endingSection}`;

  let condensed = `${header}\n${chaptersSummary}${charactersSummary}${worldSection}${prologueSection}${middleSection}${epilogueSection}`;

  // Ensure hard bound under MAX_DOCUMENT_CHARS
  if (condensed.length > MAX_DOCUMENT_CHARS) {
    condensed = condensed.slice(0, MAX_DOCUMENT_CHARS - 100) + '\n\n...[Excerpt condensed to fit context window]';
  }

  const summary = `Extracted ${chapters.length} chapters, ${characters.length} characters, and key environmental lore from ${Math.round(originalLength / 1000)}k character document.`;

  return {
    text: condensed,
    isChunked: true,
    originalLength,
    extractedChapters: chapters,
    extractedCharacters: characters,
    summary,
  };
}
