/**
 * Autocorrect CodeMirror extension.
 *
 * – Watches for word-boundary characters (space, punctuation, Enter).
 * – Checks the just-finished word against a corrections map.
 * – If a match is found, replaces it (async, so we aren't dispatching
 *   inside an update cycle).
 * – The very next Backspace press undoes the correction and restores the
 *   original word; any other key clears the undo window.
 */
import { ViewPlugin, keymap, type ViewUpdate } from '@codemirror/view';
import { Annotation, type Extension } from '@codemirror/state';

export const autocorrectAnnotation = Annotation.define<true>();

// ─── Word corrections ─────────────────────────────────────────────────────────
const CORRECTIONS: Record<string, string> = {
  // Common English typos
  teh: 'the', hte: 'the', thhe: 'the',
  taht: 'that', htat: 'that',
  adn: 'and', nad: 'and',
  woudl: 'would', wuold: 'would',
  coudl: 'could', cuold: 'could',
  shoudl: 'should',
  recieve: 'receive', recieved: 'received',
  beleive: 'believe', belive: 'believe',
  occured: 'occurred', occurance: 'occurrence',
  seperate: 'separate', seperated: 'separated',
  definately: 'definitely', definitly: 'definitely',
  accomodate: 'accommodate',
  succesful: 'successful', successfull: 'successful',
  // D&D-relevant
  charachter: 'character', charcter: 'character', chracter: 'character',
  inteligence: 'intelligence', intilligence: 'intelligence',
  strenght: 'strength', stregnth: 'strength',
  initiave: 'initiative', inititive: 'initiative',
  constitusion: 'constitution', consitution: 'constitution',
  wisodm: 'wisdom', wisdon: 'wisdom',
  cahrisma: 'charisma', carisma: 'charisma',
  speel: 'spell', speell: 'spell',
  attakc: 'attack', atack: 'attack',
  dungoen: 'dungeon', dungon: 'dungeon',
  draogn: 'dragon', drago: 'dragon',
  wepon: 'weapon', weopon: 'weapon',
  artifcat: 'artifact',
  campain: 'campaign', camapign: 'campaign',
  adventuer: 'adventure', adventrue: 'adventure',
  enounter: 'encounter', encoutner: 'encounter',
  mosnter: 'monster', montser: 'monster',
};

// ─── Plugin ───────────────────────────────────────────────────────────────────
class AutocorrectPluginImpl {
  destroyed = false;
  /** Tracks the most-recent autocorrect replacement for the Backspace undo. */
  lastCorrection: { from: number; to: number; original: string } | null = null;

  update(update: ViewUpdate) {
    if (!update.docChanged) return;
    // Don't react to our own dispatches.
    if (update.transactions.some((tr) => tr.annotation(autocorrectAnnotation))) {
      return;
    }
    // Any manual edit that isn't an autocorrect clears the undo window.
    this.lastCorrection = null;

    for (const tr of update.transactions) {
      tr.changes.iterChanges((_fa, _ta, _fb, toB, inserted) => {
        const ins = inserted.toString();
        // Only trigger on word-boundary characters.
        if (!ins || !/^[ \t,\.!?;:\n\r]/.test(ins)) return;

        // The word ends just before the boundary char in the new doc.
        const wordEnd = toB - ins.length;
        const before = update.state.doc.sliceString(Math.max(0, wordEnd - 60), wordEnd);
        const m = /([a-zA-Z]{3,})$/.exec(before);
        if (!m) return;

        const word = m[1];
        const corrected = CORRECTIONS[word.toLowerCase()];
        if (!corrected) return;

        const wordStart = wordEnd - word.length;

        // Dispatch asynchronously — can't dispatch during an update.
        const self = this;
        setTimeout(() => {
          if (self.destroyed) return;
          update.view.dispatch({
            changes: { from: wordStart, to: wordEnd, insert: corrected },
            annotations: [autocorrectAnnotation.of(true)],
          });
          self.lastCorrection = {
            from: wordStart,
            to: wordStart + corrected.length,
            original: word,
          };
        }, 0);
      });
    }
  }

  destroy() {
    this.destroyed = true;
  }
}

const AutocorrectPlugin = ViewPlugin.fromClass(AutocorrectPluginImpl);

const autocorrectKeymap = keymap.of([
  {
    key: 'Backspace',
    run(view) {
      const plugin = view.plugin(AutocorrectPlugin) as AutocorrectPluginImpl | null;
      if (!plugin?.lastCorrection) return false;
      const { from, to, original } = plugin.lastCorrection;
      plugin.lastCorrection = null;
      view.dispatch({
        changes: { from, to, insert: original },
        annotations: [autocorrectAnnotation.of(true)],
      });
      return true;
    },
  },
]);

export function autocorrectExtension(): Extension {
  return [AutocorrectPlugin, autocorrectKeymap];
}
