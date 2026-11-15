import type React from 'react';
import { BlueprintGallery } from './BlueprintGallery';
import { WorkspaceNudge } from './WorkspaceNudge';
import StarterTemplates from '~/components/chat/StarterTemplates';
import { GTM_BLUEPRINTS } from '~/lib/gtm/blueprints';
import { extractDataFileSummaries, stripDataFileSummaries } from '~/lib/gtm/data-file-block';
import { getExamplePrompts } from '~/lib/gtm/example-prompts';
import type { ComposerInputSetter, GtmBlueprint } from '~/lib/gtm/types';
import { useGtmWorkspace } from '~/lib/hooks/useGtmWorkspace';
import { classNames } from '~/utils/classNames';

export interface GtmHomeSectionsProps {
  /** The current composer text. */
  input?: string;

  /** Sets the composer text directly. Preferred: it does not go through the prompt cache. */
  setInput?: ComposerInputSetter;

  /** The composer's change handler, used when `setInput` is not available. */
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;

  /** Sends a message straight away. Example chips use it. */
  onSendPrompt?: (event: React.UIEvent, messageInput?: string) => void;
}

/** A prompt followed by the data-file summaries already in the composer, so attached files survive a replacement. */
export function withDataFileSummaries(prompt: string, composerText: string): string {
  return [prompt.trim(), ...extractDataFileSummaries(composerText)].join('\n\n');
}

/**
 * The composer text after choosing a blueprint, or undefined when the user
 * keeps what they wrote. Text the user typed is only replaced after
 * `confirmReplace` agrees; an untouched blueprint prompt is replaced silently.
 */
export function resolveBlueprintInput(
  blueprint: GtmBlueprint,
  composerText: string,
  catalog: GtmBlueprint[],
  confirmReplace: (message: string) => boolean,
): string | undefined {
  const typedText = stripDataFileSummaries(composerText);
  const isBlueprintPrompt = catalog.some((entry) => stripDataFileSummaries(entry.prompt) === typedText);

  if (typedText && !isBlueprintPrompt) {
    const keepsSummaries = extractDataFileSummaries(composerText).length > 0;
    const question = `Replace your message with the "${blueprint.title}" blueprint?`;

    if (!confirmReplace(keepsSummaries ? `${question} The attached file summaries are kept.` : question)) {
      return undefined;
    }
  }

  return withDataFileSummaries(blueprint.prompt, composerText);
}

/**
 * Everything below the composer on the landing page: example requests,
 * blueprints, the workspace invitation and the developer starters.
 *
 * The landing page is server-rendered with no props at all, so every prop is
 * optional and nothing here reads browser state during render.
 */
export function GtmHomeSections({
  input = '',
  setInput,
  handleInputChange,
  textareaRef,
  onSendPrompt,
}: GtmHomeSectionsProps) {
  const { role } = useGtmWorkspace();

  const handleSelectBlueprint = (blueprint: GtmBlueprint) => {
    const nextInput = resolveBlueprintInput(blueprint, input, GTM_BLUEPRINTS, (message) => window.confirm(message));

    if (nextInput === undefined) {
      return;
    }

    if (setInput) {
      setInput(nextInput);
    } else {
      handleInputChange?.({ target: { value: nextInput } } as React.ChangeEvent<HTMLTextAreaElement>);
    }

    /*
     * Once the prompt has rendered, show it from its first line: a plain focus()
     * scrolls the page to the caret at the end of a long prompt and leaves the
     * opening sentence, which becomes the chat title, above the fold.
     */
    requestAnimationFrame(() => {
      const textarea = textareaRef?.current;

      if (textarea) {
        textarea.focus({ preventScroll: true });
        textarea.scrollTop = 0;
        textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  };

  return (
    <div className="flex flex-col gap-8 w-full px-4 sm:px-6">
      <div
        id="examples"
        role="group"
        aria-label="Example requests"
        className="flex flex-wrap justify-center gap-2 w-full max-w-3xl mx-auto"
      >
        {getExamplePrompts(role).map((examplePrompt) => (
          <button
            key={examplePrompt}
            type="button"
            onClick={(event) => onSendPrompt?.(event, withDataFileSummaries(examplePrompt, input))}
            className={classNames(
              'rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-1',
              'text-xs text-bolt-elements-textSecondary transition-theme',
              'hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-bolt-elements-borderColorActive',
            )}
          >
            {examplePrompt}
          </button>
        ))}
      </div>
      <BlueprintGallery role={role} onSelect={handleSelectBlueprint} />
      <WorkspaceNudge />
      <section
        aria-labelledby="developer-starters-heading"
        className="flex flex-col items-center gap-3 w-full max-w-4xl mx-auto"
      >
        <h2
          id="developer-starters-heading"
          className="text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary"
        >
          For developers
        </h2>
        <StarterTemplates />
      </section>
    </div>
  );
}
