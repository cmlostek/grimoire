import * as Y from 'yjs';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { supabase } from '../../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type CollabUser = {
  name: string;
  color: string;
  colorLight: string;
};

// Deterministic color palette from userId hash.
export function userCollabColor(userId: string): { color: string; colorLight: string } {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = ((h << 5) + h) ^ userId.charCodeAt(i);
  }
  const palette = [
    { color: '#f87171', colorLight: '#f8717133' },
    { color: '#fb923c', colorLight: '#fb923c33' },
    { color: '#fbbf24', colorLight: '#fbbf2433' },
    { color: '#34d399', colorLight: '#34d39933' },
    { color: '#38bdf8', colorLight: '#38bdf833' },
    { color: '#818cf8', colorLight: '#818cf833' },
    { color: '#c084fc', colorLight: '#c084fc33' },
    { color: '#f472b6', colorLight: '#f472b633' },
  ];
  return palette[Math.abs(h) % palette.length];
}

type CollabMsg =
  | { t: 'req' }
  | { t: 'state'; u: number[] }
  | { t: 'upd'; u: number[] }
  | { t: 'aw'; u: number[] };

export class SupabaseCollabProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private channel: RealtimeChannel;
  private dead = false;

  constructor(doc: Y.Doc, noteId: string, user: CollabUser) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.awareness.setLocalStateField('user', user);

    this.channel = supabase.channel(`note-collab:${noteId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'yjs' }, ({ payload }: { payload: CollabMsg }) => {
        if (this.dead) return;
        if (payload.t === 'req') {
          // Respond to a join request with our full state.
          this.send({ t: 'state', u: Array.from(Y.encodeStateAsUpdate(this.doc)) });
          const ids = [...this.awareness.getStates().keys()];
          if (ids.length) {
            this.send({ t: 'aw', u: Array.from(encodeAwarenessUpdate(this.awareness, ids)) });
          }
        } else if (payload.t === 'state' || payload.t === 'upd') {
          Y.applyUpdate(this.doc, new Uint8Array(payload.u), this);
        } else if (payload.t === 'aw') {
          applyAwarenessUpdate(this.awareness, new Uint8Array(payload.u), this);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.send({ t: 'req' });
        }
      });

    // Broadcast incremental doc updates to peers.
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== this && !this.dead) {
        this.send({ t: 'upd', u: Array.from(update) });
      }
    });

    // Broadcast awareness (cursor) changes to peers.
    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        if (this.dead) return;
        const changed = [...added, ...updated, ...removed];
        this.send({ t: 'aw', u: Array.from(encodeAwarenessUpdate(this.awareness, changed)) });
      },
    );
  }

  private send(msg: CollabMsg) {
    this.channel.send({ type: 'broadcast', event: 'yjs', payload: msg });
  }

  destroy() {
    this.dead = true;
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'leave');
    this.awareness.destroy();
    supabase.removeChannel(this.channel);
  }
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
