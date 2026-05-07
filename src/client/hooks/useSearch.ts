import { signal } from '@preact/signals';
import {
  createPersistedBool,
} from '../lib/persisted-signal.js';

export type SearchScope = 'doc' | 'folder';

export const searchOpenSignal = signal<boolean>(false);
export const searchScopeSignal = signal<SearchScope>('doc');

const caseSensitive = createPersistedBool('mdview-search-case', false);
const wholeWord = createPersistedBool('mdview-search-word', false);
const regex = createPersistedBool('mdview-search-regex', false);

export const searchCaseSensitiveSignal = caseSensitive.signal;
export const searchWholeWordSignal = wholeWord.signal;
export const searchRegexSignal = regex.signal;

export function toggleSearchCase(): void {
  caseSensitive.set(!caseSensitive.signal.value);
}
export function toggleSearchWord(): void {
  wholeWord.set(!wholeWord.signal.value);
}
export function toggleSearchRegex(): void {
  regex.set(!regex.signal.value);
}

export function openSearch(scope: SearchScope = 'doc'): void {
  searchScopeSignal.value = scope;
  searchOpenSignal.value = true;
}

export function closeSearch(): void {
  searchOpenSignal.value = false;
}

export function setSearchScope(scope: SearchScope): void {
  searchScopeSignal.value = scope;
}

export function toggleSearch(): void {
  searchOpenSignal.value = !searchOpenSignal.value;
}
