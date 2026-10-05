// Public entry point of the bracket module. App code imports from here (or
// from './core' for framework-free code) and never from individual files, so
// the folder can later be published as its own package.
//
// Styling currently relies on the host app's Tailwind setup and its
// `avatar-gradient` class.
export { BracketView } from './BracketView';
export type { BracketViewProps } from './BracketView';
export type { MatchEditorCallbacks } from './MatchEditor';
export * from './core';
