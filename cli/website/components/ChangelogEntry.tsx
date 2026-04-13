import React from 'react';
import Link from 'next/link';
import TagBadge from './TagBadge';
import type { ChangelogWithEntries } from '../lib/db';

interface Props {
  changelog: ChangelogWithEntries;
  isLast?: boolean;
}

function formatDate(dateStr: string): { month: string; day: string; year: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    month: d.toLocaleString('en-US', { month: 'short' }),
    day: String(d.getDate()),
    year: String(d.getFullYear()),
  };
}

export default function ChangelogEntry({ changelog, isLast = false }: Props) {
  const { month, day, year } = formatDate(changelog.date);

  return (
    <div className="flex">
      {/* Timeline */}
      <div className="relative flex flex-col items-center w-6 flex-shrink-0 mr-8">
        <div className="w-2.5 h-2.5 rounded-full bg-gray-300 mt-12 z-10" />
        {!isLast && <div className="flex-1 w-px bg-gray-100" />}
      </div>

      {/* Original layout */}
      <div className="flex-1 flex gap-8 md:gap-16 py-10 border-b border-gray-100 last:border-0">
        {/* Date column */}
        <div className="w-16 md:w-24 flex-shrink-0 pt-0.5">
          <div className="text-sm font-semibold text-gray-900">
            {month} {day}
          </div>
          <div className="text-sm text-gray-400">{year}</div>
        </div>

        {/* Entries column */}
        <div className="flex-1 min-w-0 space-y-6">
          {changelog.entries.map((entry) => (
            <Link key={entry.id} href={`/entry/${entry.id}`} className="block group">
              <div className="flex flex-wrap items-start gap-2 mb-1.5">
                <h2 className="text-base font-semibold text-gray-900 leading-snug group-hover:text-gray-600 transition-colors">
                  {entry.title}
                </h2>
                {entry.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} size="sm" />
                ))}
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{entry.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
