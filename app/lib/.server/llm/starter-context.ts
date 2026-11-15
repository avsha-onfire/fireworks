import { isStarterPreamble } from '~/lib/gtm/starter-selection';

/*
 * Trims the starter project that is replayed to the model.
 *
 * A starter template is kept in the chat history as one `imported-files`
 * artifact holding every file. With the shadcn/ui starter, most of that text
 * is the stock component library in `src/components/ui`: files the model
 * should reuse but never edit, resent on every model step. The model only
 * needs to know which components exist, so their bodies are replaced by a
 * list of file names. Only the text sent to the model changes; the stored
 * chat and the project files are untouched.
 *
 * Git, zip and folder imports use the same artifact id, but their
 * `src/components/ui` holds the user's own code, which the model must see in
 * full. Only an artifact directly below the starter's preamble line is
 * collapsed.
 */

const IMPORTED_FILES_OPEN = '<boltArtifact id="imported-files"';
const ARTIFACT_CLOSE = '</boltArtifact>';
const ACTION_CLOSE = '</boltAction>';
const UI_DIRECTORY = 'src/components/ui/';
const UI_ACTION_OPEN = `<boltAction type="file" filePath="${UI_DIRECTORY}`;

/*
 * shadcn/ui projects carry this manifest at their root. Without it,
 * `src/components/ui` may hold the user's own components (a common folder
 * name in imported repositories), and those must stay visible.
 */
const SHADCN_MANIFEST_ACTION = '<boltAction type="file" filePath="components.json">';

/** Longest file name, relative to the components folder, that is treated as a real path. */
const MAX_NAME_LENGTH = 120;

/** Longest line that is checked as the starter's preamble; it bounds the look-back before each artifact. */
const MAX_PREAMBLE_LENGTH = 300;

/** True when the line right above the artifact starting at `artifactStart` is the starter's preamble. */
function followsStarterPreamble(text: string, artifactStart: number): boolean {
  const lineEnd = artifactStart - 1;

  if (text[lineEnd] !== '\n') {
    return false;
  }

  const windowStart = Math.max(0, lineEnd - MAX_PREAMBLE_LENGTH);
  const window = text.slice(windowStart, lineEnd);
  const lineBreak = window.lastIndexOf('\n');

  // No line start within the window means the line is too long to be the preamble.
  if (lineBreak === -1 && windowStart > 0) {
    return false;
  }

  return isStarterPreamble(window.slice(lineBreak + 1));
}

function componentsNote(names: string[]): string {
  return `[Read-only shadcn/ui components already in src/components/ui; bodies omitted to save context; read a file with the project tools if you need its exact API: ${names.join(', ')}]\n`;
}

/** Collapses the component files of one artifact, given without its closing tag. */
function collapseArtifact(artifact: string): string {
  if (!artifact.includes(SHADCN_MANIFEST_ACTION)) {
    return artifact;
  }

  const pieces: string[] = [];
  const names: string[] = [];

  let noteIndex = 0;
  let cursor = 0;
  let actionStart = artifact.indexOf(UI_ACTION_OPEN);

  while (actionStart !== -1) {
    const nameStart = actionStart + UI_ACTION_OPEN.length;

    // The search window is bounded so that malformed input cannot make the scan quadratic.
    const nameLength = artifact.slice(nameStart, nameStart + MAX_NAME_LENGTH + 2).indexOf('">');

    if (nameLength < 1) {
      actionStart = artifact.indexOf(UI_ACTION_OPEN, nameStart);
      continue;
    }

    const actionEnd = artifact.indexOf(ACTION_CLOSE, nameStart + nameLength);

    // An unterminated action means the artifact is incomplete: leave the rest as it is.
    if (actionEnd === -1) {
      break;
    }

    pieces.push(artifact.slice(cursor, actionStart));

    if (names.length === 0) {
      // The note takes the place of the first component file.
      noteIndex = pieces.length;
      pieces.push('');
    }

    names.push(artifact.slice(nameStart, nameStart + nameLength));
    cursor = actionEnd + ACTION_CLOSE.length;

    if (artifact[cursor] === '\n') {
      cursor += 1;
    }

    actionStart = artifact.indexOf(UI_ACTION_OPEN, cursor);
  }

  if (names.length === 0) {
    return artifact;
  }

  pieces[noteIndex] = componentsNote(names);
  pieces.push(artifact.slice(cursor));

  return pieces.join('');
}

/**
 * Replaces the bodies of the shadcn/ui component files inside the starter's
 * `imported-files` artifact with one note listing their file names.
 *
 * Everything else is returned byte for byte: text without such an artifact,
 * the other files of the starter, git, zip and folder imports, and file
 * actions in any other artifact, such as a component the model or the user
 * wrote later. Running it on its own output changes nothing, and the scan is
 * linear in the length of the text.
 */
export function collapseStarterBoilerplate(text: string): string {
  let artifactStart = text.indexOf(IMPORTED_FILES_OPEN);

  if (artifactStart === -1) {
    return text;
  }

  const pieces: string[] = [];

  let cursor = 0;

  while (artifactStart !== -1) {
    const artifactEnd = text.indexOf(ARTIFACT_CLOSE, artifactStart);

    if (artifactEnd === -1) {
      break;
    }

    const artifact = text.slice(artifactStart, artifactEnd);

    pieces.push(
      text.slice(cursor, artifactStart),
      followsStarterPreamble(text, artifactStart) ? collapseArtifact(artifact) : artifact,
    );
    cursor = artifactEnd;
    artifactStart = text.indexOf(IMPORTED_FILES_OPEN, artifactEnd);
  }

  pieces.push(text.slice(cursor));

  return pieces.join('');
}
