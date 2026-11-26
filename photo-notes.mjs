// Photo of notes -> calendar. The server reads the photo; this file prepares it and turns the
// reviewed rows into events (when a time is known) or deadlines (when only the day is known).

const toMin = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const plusHour = time => { const t = Math.min(toMin(time) + 60, 1439); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const STUDY = /\b(test|exam|quiz|midterm|final|essay|homework|assignment|project|presentation|oral|revision|maths?|math|science|history|geography|biology|chemistry|physics|english|language|literature|art|music|class|lesson|lecture|school)\b/i;
const category = title => STUDY.test(title) ? 'Study' : 'Personal projects';

// Rows with a start time become events (1 hour if no end was written); rows without one become deadlines.
// A timed row that would overlap something already in the calendar is saved as a deadline instead,
// because fixed events can't overlap (e.g. a test during school hours).
export function planPhotoRows(rows, day) {
  const taken = new Map();
  return rows.map(row => {
    const base = { ...row, title: String(row.title || '').trim() };
    if (!base.date) return { ...base, as: 'missing-date' };
    if (!base.start) return { ...base, as: 'deadline' };
    const end = base.end && base.end > base.start ? base.end : plusHour(base.start);
    const busy = [...day(base.date).filter(item => !item.sourceRoutine && !item.sourceImport), ...(taken.get(base.date) || [])];
    const hit = busy.find(item => toMin(item.start) < toMin(end) && toMin(item.end) > toMin(base.start));
    if (hit) return { ...base, end, as: 'deadline', clash: hit };
    taken.set(base.date, [...(taken.get(base.date) || []), { title: base.title, start: base.start, end }]);
    return { ...base, end, as: 'event' };
  });
}

export function photoInputs(planned, makeId) {
  return planned.filter(row => row.as === 'event' || row.as === 'deadline').map(row => {
    const shared = { id: makeId(), title: row.title.slice(0, 120), category: category(row.title), priority: 'Medium', reminder: 'default', completed: false, locked: false, repeat: 'none', repeatUntil: '' };
    const from = 'Added from a photo of your notes';
    if (row.as === 'event') return { ...shared, kind: 'fixed', date: row.date, start: row.start, end: row.end, notes: from };
    const time = row.start ? ` Time on the note: ${row.start}${row.end ? `–${row.end}` : ''}.` : '';
    return { ...shared, kind: 'task', date: '', deadline: row.date, duration: 30, spent: 0, notes: `${from}.${time}` };
  });
}

// Phone photos are large; shrink to at most 1600px on the long side as JPEG so uploads stay small.
export async function shrinkPhoto(file, maxSide = 1600) {
  if (!/^image\//.test(file.type) && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name || '')) throw new Error('Choose a photo (JPEG, PNG, WebP or iPhone photo).');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    // Some browsers can't decode certain formats with createImageBitmap; fall back to an <img>.
    bitmap = await new Promise((resolve, reject) => { const img = new Image(), url = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This browser can’t open that photo. Try a screenshot or a JPEG instead.')); }; img.src = url; });
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}
