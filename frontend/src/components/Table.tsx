import type { ReactNode } from 'react';
import { Empty } from './Card';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  align?: 'right';
}

export function Table<T>({ columns, rows, rowKey, empty = 'Nothing here yet.' }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: string }) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="table-wrap">
      <table className="stack">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={c.align === 'right' ? 'r' : ''}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
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
