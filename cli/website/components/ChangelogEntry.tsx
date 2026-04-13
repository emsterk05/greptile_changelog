import React from 'react';
import Link from 'next/link';
import TagBadge from './TagBadge';
import type { ChangelogWithEntries } from '../lib/db';

interface Props {
  changelog: ChangelogWithEntries;
}

function formatDate(dateStr: string): { month: string; day: string; year: string } {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    month: d.toLocaleString('en-US', { month: 'short' }),
    day: String(d.getDate()),
    year: String(d.getFullYear()),
  };
}

export default function ChangelogEntry({ changelog }: Props) {
  const { month, day, year } = formatDate(changelog.date);

  return (
    <div className="flex gap-8 md:gap-16 py-10 border-b border-gray-100 last:border-0">
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
          <div key={entry.id}>
            <div className="flex flex-wrap items-start gap-2 mb-1.5">
              <h2 className="text-base font-semibold text-gray-900 leading-snug">
                {entry.title}
              </h2>
              <TagBadge tag={entry.tag} size="sm" />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">{entry.description}</p>
          </div>
        ))}

        <div className="pt-1">
          <Link
            href={`/${changelog.id}`}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            View details →
          </Link>
        </div>
      </div>
    </div>
  );
}
