// DOM helper utilities for renderer
// Keep naming consistent with existing code to minimize changes

export const $ = (selector: string) => document.querySelector(selector);
export const $$ = (selector: string) => document.querySelectorAll(selector);
export const $_ = (selector: string) => document.getElementById(selector);
export const $c = (selector: string) => document.querySelector(`details[data-cheat="${selector}"]`);
export const $i = (selector: string): HTMLInputElement => document.getElementById(selector) as HTMLInputElement;
export const $$_ = (selector: string) => Array.from($$(selector));
