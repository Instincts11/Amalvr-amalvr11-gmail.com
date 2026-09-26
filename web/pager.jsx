import { useEffect, useState } from 'react';

export function usePaged(items, pageSize, resetKey) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey]);
  const count = items.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const safe = Math.min(page, pages - 1);
  const start = safe * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    page: safe,
    pages,
    start,
    count,
    pageSize,
    setPage,
  };
}

export function Pager({ page, pages, start, count, pageSize, setPage }) {
  if (count === 0) return null;
  const end = Math.min(start + pageSize, count);
  return (
    <div className="mt-3 flex items-center justify-between gap-4 text-xs text-[#7f8c82]">
      <span>{start + 1}–{end} of {count}</span>
      <div className="flex gap-4">
        {page > 0 && (
          <button type="button" className="text-[#39FF14]" onClick={() => setPage(page - 1)}>Previous</button>
        )}
        <span className="text-[#7f8c82]">{page + 1} / {pages}</span>
        {page < pages - 1 && (
          <button type="button" className="text-[#39FF14]" onClick={() => setPage(page + 1)}>Next</button>
        )}
      </div>
    </div>
  );
}
