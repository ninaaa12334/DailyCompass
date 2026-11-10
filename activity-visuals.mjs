// Decoration only: activity meaning never changes scheduling or saved records.
export function activityVisual(item) {
  const title = String(item.title || '').toLowerCase();
  if (/football|soccer|futboll/.test(title)) return { kind: 'football', icon: '\u26bd', label: 'Football' };
  if (/volleyball|volejboll/.test(title)) return { kind: 'volleyball', icon: '\ud83c\udfd0', label: 'Volleyball' };
  if (/school|class|lecture|shkoll/.test(title)) return { kind: 'school', icon: '\ud83c\udf93', label: 'School' };
  if (/math|revision|study|homework|exam/.test(title) || item.category === 'Study') return { kind: 'study', icon: '\ud83d\udcda', label: 'Study' };
  if (/creative|draw|paint|art|design/.test(title)) return { kind: 'creative', icon: '\ud83c\udfa8', label: 'Creative time' };
  if (item.kind === 'break' || /rest|break|relax/.test(title)) return { kind: 'rest', icon: '\u2615', label: 'Rest' };
  if (item.category === 'Exercise') return { kind: 'exercise', icon: '\u2197', label: 'Exercise' };
  return { kind: 'personal', icon: '\u2727', label: 'Activity' };
}
