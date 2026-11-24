import { useMemo, useState, type ReactNode } from 'react';
import { Empty } from './Card';

export interface SortColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string;
  align?: 'right';
}

export function SortableTable<T>({ columns, rows, rowKey, empty = 'Nothing here yet.', initial }: { columns: SortColumn<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: string; initial?: { col: number; dir: 'asc' | 'desc' } }) {
  const [sort, setSort] = useState<{ col: number; dir: 'asc' | 'desc' }>(initial ?? { col: -1, dir: 'desc' });
  const sorted = useMemo(() => {
    const col = columns[sort.col];
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, columns, sort]);

  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="table-wrap">
      <table className="stack">
        <thead>
          <tr>
            {columns.map((c, i) => {
              const active = sort.col === i;
              return (
                <th key={c.header} className={c.align === 'right' ? 'r' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? (
                    <button className="sort-btn" onClick={() => setSort({ col: i, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}>
                      {c.header} <span aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.header} data-label={c.header} className={c.align === 'right' ? 'r' : ''}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
