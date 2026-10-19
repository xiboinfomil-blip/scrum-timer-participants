export const NOTE_SECTIONS = [
  { key: 'recent', heading: 'Récemment', label: 'Ce que j’ai fait récemment', prompt: 'Une avancée, une tâche terminée…', placeholder: 'J’ai terminé, livré, débloqué…', number: '01' },
  { key: 'now', heading: 'Maintenant', label: 'Ce que je fais maintenant', prompt: 'Votre priorité du moment.', placeholder: 'Je travaille sur…', number: '02' },
  { key: 'later', heading: 'Ensuite', label: 'Ce que je ferai ensuite', prompt: 'La prochaine étape, un besoin, un blocage.', placeholder: 'Ensuite, je prévois de…', number: '03' },
] as const;

export type NoteSections = Record<(typeof NOTE_SECTIONS)[number]['key'], string>;

export function parseNoteSections(value: string): NoteSections {
  const result: NoteSections = { recent: '', now: '', later: '' };
  const pattern = /(?:^|\n\n)\*\*(Récemment|Maintenant|Ensuite)\*\*\n\n/g;
  const matches = [...value.matchAll(pattern)];
  // Older free-form notes are never discarded or silently rewritten on opening.
  if (!matches.length || matches[0].index !== 0) return { ...result, recent: value };
  const keys = matches.map(match => NOTE_SECTIONS.find(section => section.heading === match[1])!.key);
  if (new Set(keys).size !== keys.length) return { ...result, recent: value };
  matches.forEach((match, index) => {
    result[keys[index]] = value.slice(match.index! + match[0].length, matches[index + 1]?.index ?? value.length);
  });
  return result;
}

export function serializeNoteSections(sections: NoteSections): string {
  return NOTE_SECTIONS.filter(section => sections[section.key].trim())
    .map(section => `**${section.heading}**\n\n${sections[section.key]}`).join('\n\n');
}