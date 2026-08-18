export type ListingSyncKeyedRow = {
  id: string;
  eventType: string;
  eventDate?: string | null;
};

export function listingSyncKeyOf(event: ListingSyncKeyedRow): string {
  return `${event.id}:${event.eventType}:${event.eventDate ?? "missing"}`;
}

export function partitionListingSyncRows<T extends ListingSyncKeyedRow>(
  sourceRows: T[],
  existingRows: T[],
): { appendable: T[]; duplicates: T[] } {
  const seen = new Set(existingRows.map(listingSyncKeyOf));
  const appendable: T[] = [];
  const duplicates: T[] = [];

  for (const row of sourceRows) {
    const key = listingSyncKeyOf(row);
    if (seen.has(key)) duplicates.push(row);
    else {
      appendable.push(row);
      seen.add(key);
    }
  }

  return { appendable, duplicates };
}
