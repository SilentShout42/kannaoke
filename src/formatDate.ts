export const formatDate = (iso: string, locale?: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
