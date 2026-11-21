/**
 * Traduction automatique complète de l'interface.
 *
 * 1. Les textes déjà traduits sont remplacés depuis le dictionnaire chargé par
 *    le provider (base de données).
 * 2. Les textes manquants sont envoyés par lots à `POST /api/i18n/translate`,
 *    qui utilise une API gratuite (Google / MyMemory) et met le résultat en
 *    cache en base, puis le dictionnaire est mis à jour à chaud.
 * 3. Un MutationObserver traduit les nœuds ajoutés plus tard par React.
 */

import { useEffect, useRef } from 'react';

import { useI18n } from '@/i18n/I18nContext';
import { translationKey } from '@/i18n/translationKey';
import { apiPost } from '@/lib/apiClient';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION']);
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];

export function AutoTranslate(): null {
  const { locale, dbDictionary, addTranslations } = useI18n();
  const dictionaryRef = useRef(dbDictionary);
  dictionaryRef.current = dbDictionary;

  useEffect(() => {
    if (locale === 'fr') return;

    const textState = new Map<Text, { original: string; translated: string }>();
    const attributeState = new Map<Element, Map<string, string>>();
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const lookup = (source: string): string | null => {
      const variants = new Set([source, source.toUpperCase(), source.toLowerCase()]);
      for (const candidate of [...variants]) {
        variants.add(candidate.replace(/[’']/g, '’'));
        variants.add(candidate.replace(/[’']/g, "'"));
      }
      for (const candidate of variants) {
        const value = dictionaryRef.current[translationKey(candidate)];
        if (value && value !== candidate) return value;
      }
      return null;
    };

    const requestTranslations = (source: string): void => {
      if (source.length < 2 || source.length > 500 || pending.has(source)) return;
      pending.add(source);
    };

    const flush = (): void => {
      if (pending.size === 0) return;
      const texts = [...pending].slice(0, 60);
      texts.forEach((text) => pending.delete(text));
      void apiPost<{ translations: Record<string, string> }>('/i18n/translate', {
        texts,
        target: locale,
      })
        .then((response) => addTranslations(response.translations ?? {}))
        .catch(() => {
          // Réseau indisponible : les textes restent en français.
        });
    };

    const scheduleFlush = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    };

    const translateTextNode = (node: Text): void => {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest('[data-no-i18n]')) return;
      const raw = node.nodeValue ?? '';
      const source = raw.trim();
      if (source.length < 2) return;
      const translated = lookup(source);
      if (!translated) {
        if (/[\p{L}]/u.test(source)) {
          requestTranslations(source);
          scheduleFlush();
        }
        return;
      }
      const state = textState.get(node);
      if (state?.translated === translated && raw === translated) return;
      textState.set(node, { original: raw, translated });
      node.nodeValue = raw.replace(source, translated);
    };

    const translateAttributes = (element: Element): void => {
      if (!(element instanceof HTMLElement) || element.closest('[data-no-i18n]')) return;
      let state = attributeState.get(element);
      if (!state) {
        state = new Map();
        attributeState.set(element, state);
      }
      for (const name of ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (!value || value.trim().length < 2 || value.startsWith('http') || value.startsWith('/')) continue;
        const source = value.trim();
        if (state.get(name) === source) continue;
        const translated = lookup(source);
        if (!translated) {
          requestTranslations(source);
          scheduleFlush();
          continue;
        }
        state.set(name, source);
        element.setAttribute(name, value.replace(source, translated));
      }
    };

    const walk = (root: Node): void => {
      if (root instanceof Text) {
        translateTextNode(root);
        return;
      }
      if (root instanceof Element) {
        translateAttributes(root);
        if (SKIP_TAGS.has(root.tagName)) return;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current: Node | null = walker.nextNode();
      while (current) {
        translateTextNode(current as Text);
        current = walker.nextNode();
      }
    };

    walk(document.body);

    observer = new MutationObserver((mutations) => {
      if (!observer) return;
      observer.disconnect();
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target instanceof Text) {
          translateTextNode(mutation.target);
        } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(walk);
        }
      }
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer?.disconnect();
      observer = null;
      if (timer) clearTimeout(timer);
      for (const [node, state] of textState) {
        if (node.nodeValue === state.translated) node.nodeValue = state.original;
      }
      for (const [element, states] of attributeState) {
        for (const [name, original] of states) element.setAttribute(name, original);
      }
    };
  }, [locale, dbDictionary, addTranslations]);

  return null;
}
